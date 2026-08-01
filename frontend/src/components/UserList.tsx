import { useCanvasStore } from '../store/useCanvasStore';

export function UserList() {
  const users = useCanvasStore((s) => s.users);

  if (users.length === 0) {
    return <p className="text-xs text-gray-500">No other users online</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 mb-1">Online ({users.length})</p>
      {users.map((user) => (
        <div key={user.userId} className="flex items-center gap-2 text-xs">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ backgroundColor: user.color }}
          />
          <span className="text-gray-300 truncate max-w-[120px]">{user.userName}</span>
        </div>
      ))}
    </div>
  );
}
