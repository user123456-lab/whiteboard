import { useCanvasStore } from '../store/useCanvasStore';

export function UserList() {
  const users = useCanvasStore((s) => s.users);

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
        Online ({users.length})
      </p>
      {users.length === 0 ? (
        <p className="text-[11px] text-slate-600 italic">Only you</p>
      ) : (
        <div className="space-y-0.5">
          {users.map((user) => (
            <div key={user.userId} className="flex items-center gap-2 py-0.5">
              <span
                className="avatar-dot"
                style={{ backgroundColor: user.color }}
              />
              <span className="text-[12px] text-slate-300 truncate max-w-[130px]">
                {user.userName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
