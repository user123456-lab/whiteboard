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
    await asyncio.sleep(1.0)
    await ws.close()
    await asyncio.sleep(0.5)

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


async def test_v2_flow_shapes():
    """Test v2.0 flow shapes: roundedRect, diamond, parallelogram, cylinder, document"""
    print("\n── v2.0 Flow Shapes ──")

    ws = await websockets.connect(f"{BASE}/ws/testroom-v2shapes?userId=user-a&userName=Alice")
    _ = await recv_until(ws, "room_state")

    flow_shape_types = ["roundedRect", "diamond", "parallelogram", "cylinder", "document"]
    shape_ids = []

    for stype in flow_shape_types:
        shape = {
            "id": f"shape-{stype}",
            "type": stype,
            "userId": "user-a",
            "x": 100, "y": 100, "width": 160, "height": 100,
            "color": "#3B82F6", "strokeWidth": 2,
            "createdAt": int(time.time() * 1000),
            "version": 1,
        }
        await ws.send(make_msg("shape_created", "user-a", {"shape": shape}))
        shape_ids.append(f"shape-{stype}")
        await asyncio.sleep(0.05)

    # 验证所有图形样式都存储了
    state = await recv_until(ws, "room_state")
    # No more room_state; instead, verify by reconnecting
    await ws.close()
    await asyncio.sleep(0.3)

    ws2 = await websockets.connect(f"{BASE}/ws/testroom-v2shapes?userId=user-b&userName=Bob")
    state = await recv_until(ws2, "room_state")
    if state:
        shapes = state.get("payload", {}).get("shapes", [])
        found = sum(1 for s in shapes if s.get("id", "").startswith("shape-"))
        if found == 5:
            ok(f"5 flow shapes persisted ({found}/5)")
        else:
            fail("flow shapes persist", f"found {found}/5")
    else:
        fail("flow shapes: room_state on reconnect")

    await ws2.close()


async def test_v2_connector():
    """Test v2.0 connector shape creation and properties"""
    print("\n── v2.0 Connector ──")

    ws = await websockets.connect(f"{BASE}/ws/testroom-conn?userId=user-a&userName=Alice")
    _ = await recv_until(ws, "room_state")

    # 先创建两个矩形作为连接端点
    rect_a = {
        "id": "conn-rect-a",
        "type": "rectangle",
        "userId": "user-a",
        "x": 0, "y": 0, "width": 100, "height": 100,
        "color": "#3B82F6", "strokeWidth": 2,
        "createdAt": int(time.time() * 1000), "version": 1,
    }
    rect_b = {
        "id": "conn-rect-b",
        "type": "rectangle",
        "userId": "user-a",
        "x": 200, "y": 0, "width": 100, "height": 100,
        "color": "#EF4444", "strokeWidth": 2,
        "createdAt": int(time.time() * 1000), "version": 1,
    }
    await ws.send(make_msg("shape_created", "user-a", {"shape": rect_a}))
    await ws.send(make_msg("shape_created", "user-a", {"shape": rect_b}))
    await asyncio.sleep(0.1)

    connector = {
        "id": "conn-001",
        "type": "connector",
        "userId": "user-a",
        "fromShapeId": "conn-rect-a",
        "toShapeId": "conn-rect-b",
        "fromEdge": "right",
        "toEdge": "left",
        "endArrow": True,
        "color": "#22C55E",
        "strokeWidth": 2,
        "createdAt": int(time.time() * 1000),
        "version": 1,
    }
    await ws.send(make_msg("shape_created", "user-a", {"shape": connector}))
    await asyncio.sleep(0.3)
    await ws.close()
    await asyncio.sleep(0.3)

    # 重连验证连接线持久化
    ws2 = await websockets.connect(f"{BASE}/ws/testroom-conn?userId=user-b&userName=Bob")
    state = await recv_until(ws2, "room_state")
    if state:
        shapes = state.get("payload", {}).get("shapes", [])
        conn_shapes = [s for s in shapes if s.get("type") == "connector"]
        if len(conn_shapes) == 1:
            c = conn_shapes[0]
            if c.get("fromShapeId") == "conn-rect-a" and c.get("toShapeId") == "conn-rect-b":
                ok("connector shape persists with correct endpoints")
            else:
                fail("connector endpoints", f"from={c.get('fromShapeId')} to={c.get('toShapeId')}")
        else:
            fail("connector persist", f"found {len(conn_shapes)} connectors")
    else:
        fail("connector: room_state on reconnect")

    await ws2.close()


async def test_v2_batch_update():
    """Test v2.0 shape_updated_batch message type"""
    print("\n── v2.0 Batch Update ──")

    ws_a = await websockets.connect(f"{BASE}/ws/testroom-batch?userId=user-a&userName=Alice")
    _ = await recv_until(ws_a, "room_state")
    ws_b = await websockets.connect(f"{BASE}/ws/testroom-batch?userId=user-b&userName=Bob")
    _ = await recv_until(ws_b, "room_state")
    _ = await recv_until(ws_a, "user_joined")

    # 创建两个图形
    for i, name in enumerate(["batch-a", "batch-b"]):
        shape = {
            "id": name, "type": "rectangle", "userId": "user-a",
            "x": i * 120, "y": 0, "width": 100, "height": 100,
            "color": "#3B82F6", "strokeWidth": 2,
            "createdAt": int(time.time() * 1000), "version": 1,
        }
        await ws_a.send(make_msg("shape_created", "user-a", {"shape": shape}))
        await asyncio.sleep(0.05)

    # 批量更新
    await ws_a.send(make_msg("shape_updated_batch", "user-a", {
        "updates": [
            {"shapeId": "batch-a", "changes": {"x": 50, "y": 50}},
            {"shapeId": "batch-b", "changes": {"x": 150, "y": 50}},
        ]
    }))

    # B 应收到批量更新广播
    msg = await recv_until(ws_b, "shape_updated_batch", timeout=5)
    if msg:
        updates = msg.get("payload", {}).get("updates", [])
        if len(updates) == 2:
            ok(f"batch update broadcast ({len(updates)} updates)")
        else:
            fail("batch update count", f"expected 2, got {len(updates)}")
    else:
        fail("batch update broadcast")

    await ws_a.close()
    await ws_b.close()


async def test_network_endpoint():
    """Test GET /api/network returns correct format"""
    print("\n── Network Endpoint ──")

    import urllib.request

    try:
        resp = urllib.request.urlopen("http://localhost:8000/api/network", timeout=5)
        data = json.loads(resp.read())
        required_keys = {"lanIp", "port", "frontendPort"}
        if required_keys.issubset(data.keys()):
            if isinstance(data["port"], int) and isinstance(data["frontendPort"], int):
                ok(f"network endpoint returns valid data: {data['lanIp']}:{data['port']}")
            else:
                fail("network: port types", str(data))
        else:
            fail("network: missing keys", str(data))
    except Exception as e:
        fail("network endpoint", str(e))


async def main():
    global passed, failed
    print("Whiteboard E2E Protocol Test")
    print("=" * 40)

    for test_fn, name in [
        (test_room_lifecycle, "Room Lifecycle"),
        (test_shape_crud, "Shape CRUD"),
        (test_persistence, "Data Persistence"),
        (test_v2_flow_shapes, "v2.0 Flow Shapes"),
        (test_v2_connector, "v2.0 Connector"),
        (test_v2_batch_update, "v2.0 Batch Update"),
        (test_network_endpoint, "Network Endpoint"),
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
