"""
End-to-end test for whiteboard WebSocket protocol.
Tests: room creation, shape sync, optimistic lock, multi-user.
"""
import asyncio
import json
import websockets
import time

BASE = "ws://localhost:8000"

passed = 0
failed = 0

def ok(name):
    global passed
    passed += 1
    print(f"  [PASS] {name}")

def fail(name, detail=""):
    global failed
    failed += 1
    print(f"  [FAIL] {name}: {detail}")

async def recv_until(ws, msg_type, timeout=10):
    """Keep receiving until we get a message of the expected type. Skip pings."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=min(3, timeout))
            msg = json.loads(raw)
            if msg.get("type") == msg_type:
                return msg
            # skip pings and other types
        except asyncio.TimeoutError:
            continue
    return None

def make_msg(msg_type, user_id, payload):
    return json.dumps({
        "type": msg_type,
        "userId": user_id,
        "timestamp": int(time.time() * 1000),
        "payload": payload,
    })

async def test_room_lifecycle():
    """Test room creation, join, leave"""
    print("\n── Room Lifecycle ──")

    # Create room (user A)
    ws_a = await websockets.connect(f"{BASE}/ws/testroom?userId=user-a&userName=Alice")

    # Server sends room_state first, then user_joined (broadcast includes joiner)
    msg = await recv_until(ws_a, "room_state")
    if msg:
        shapes = msg.get("payload", {}).get("shapes", [])
        ok(f"user A receives room_state ({len(shapes)} shapes)")
    else:
        fail("user A room_state")

    # Join room (user B)
    ws_b = await websockets.connect(f"{BASE}/ws/testroom?userId=user-b&userName=Bob")
    _ = await recv_until(ws_b, "room_state")

    # A should get user_joined for B
    msg = await recv_until(ws_a, "user_joined")
    if msg:
        ok("user A notified of user B joining")
    else:
        fail("user A notified of user B joining")

    await ws_b.close()
    # A should get user_left for B
    msg = await recv_until(ws_a, "user_left", timeout=5)
    if msg:
        ok("user A notified of user B leaving")
    else:
        fail("user A notified of user B leaving")

    await ws_a.close()


async def test_shape_crud():
    """Test shape create, update, delete broadcast"""
    print("\n── Shape CRUD ──")

    ws_a = await websockets.connect(f"{BASE}/ws/testroom2?userId=user-a&userName=Alice")
    _ = await recv_until(ws_a, "room_state")

    ws_b = await websockets.connect(f"{BASE}/ws/testroom2?userId=user-b&userName=Bob")
    _ = await recv_until(ws_b, "room_state")
    _ = await recv_until(ws_a, "user_joined")  # B's join notification to A

    # A creates a rectangle with fill
    shape = {
        "id": "shape-001",
        "type": "rectangle",
        "userId": "user-a",
        "x": 100, "y": 100, "width": 200, "height": 150,
        "color": "#3B82F6", "strokeWidth": 2, "fill": "#FF0000",
        "createdAt": int(time.time() * 1000),
        "version": 1,
    }
    await ws_a.send(make_msg("shape_created", "user-a", {"shape": shape}))

    msg = await recv_until(ws_b, "shape_created")
    if msg:
        rcvd = msg.get("payload", {}).get("shape", {})
        if rcvd.get("id") == "shape-001" and rcvd.get("fill") == "#FF0000":
            ok("shape_created broadcast (with fill)")
        else:
            fail("shape_created fill", f"got fill={rcvd.get('fill')}")
    else:
        fail("shape_created broadcast")

    # A updates shape with correct expectedVersion
    await ws_a.send(make_msg("shape_updated", "user-a", {
        "shapeId": "shape-001",
        "changes": {"color": "#22C55E"},
        "expectedVersion": 1,
    }))

    msg = await recv_until(ws_b, "shape_updated")
    if msg:
        ok("shape_updated broadcast")
    else:
        fail("shape_updated broadcast")

    # A updates again with WRONG expectedVersion (stale)
    await ws_a.send(make_msg("shape_updated", "user-a", {
        "shapeId": "shape-001",
        "changes": {"color": "#EF4444"},
        "expectedVersion": 1,
    }))

    msg = await recv_until(ws_a, "shape_conflict")
    if msg:
        ok("optimistic lock: conflict detected")
    else:
        fail("optimistic lock conflict")

    # Update without expectedVersion (backward compat) — should succeed
    # Server broadcasts to others (excluding sender), so B should receive it
    await ws_a.send(make_msg("shape_updated", "user-a", {
        "shapeId": "shape-001",
        "changes": {"color": "#8B5CF6"},
    }))

    msg = await recv_until(ws_b, "shape_updated", timeout=5)
    if msg:
        ok("update without expectedVersion (backward compat)")
    else:
        fail("backward compat update")

    # A deletes shape
    await ws_a.send(make_msg("shape_deleted", "user-a", {"shapeId": "shape-001"}))
    msg = await recv_until(ws_b, "shape_deleted")
    if msg:
        ok("shape_deleted broadcast")
    else:
        fail("shape_deleted broadcast")

    await ws_a.close()
    await ws_b.close()


async def test_persistence():
    """Test data persistence: shapes survive reconnection"""
    print("\n── Data Persistence ──")

    room = "persist-test-2"
    ws = await websockets.connect(f"{BASE}/ws/{room}?userId=test-user&userName=Tester")
    _ = await recv_until(ws, "room_state")

    shape = {
        "id": "persist-shape",
        "type": "circle",
        "userId": "test-user",
        "x": 200, "y": 200, "radius": 50,
        "color": "#F59E0B", "strokeWidth": 3,
        "createdAt": int(time.time() * 1000),
        "version": 1,
    }
    await ws.send(make_msg("shape_created", "test-user", {"shape": shape}))
    await asyncio.sleep(0.5)
    await ws.close()
    await asyncio.sleep(0.3)

    # Reconnect — shape should still be there
    ws2 = await websockets.connect(f"{BASE}/ws/{room}?userId=test-user2&userName=Tester2")
    state = await recv_until(ws2, "room_state")

    if state:
        shapes = state.get("payload", {}).get("shapes", [])
        if any(s.get("id") == "persist-shape" for s in shapes):
            ok("shape persists after reconnect")
        else:
            fail("shape persists", f"found {len(shapes)} shapes, ids: {[s.get('id') for s in shapes]}")
    else:
        fail("persist: room_state on reconnect")

    await ws2.close()


async def main():
    global passed, failed
    print("Whiteboard E2E Protocol Test")
    print("=" * 40)

    for test_fn, name in [
        (test_room_lifecycle, "Room Lifecycle"),
        (test_shape_crud, "Shape CRUD"),
        (test_persistence, "Data Persistence"),
    ]:
        try:
            await test_fn()
        except Exception as e:
            fail(name, str(e))

    print("\n" + "=" * 40)
    print(f"Results: {passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    result = asyncio.run(main())
    exit(0 if result else 1)
