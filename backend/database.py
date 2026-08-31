"""MySQL 数据库连接池管理与建表（SQLAlchemy Core 异步模式）"""
import os
import json
import time
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

# ── 配置（从环境变量读取） ──

DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "whiteboard")

DATABASE_URL = f"mysql+aiomysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = None
_session_factory = None


def get_session() -> AsyncSession:
    """获取一个新的异步数据库会话"""
    return _session_factory()


async def init_db():
    """初始化连接池，创建数据库和表"""
    global engine, _session_factory

    # 1. 创建数据库（如果不存在）
    import pymysql
    try:
        conn = pymysql.connect(
            host=DB_HOST, port=int(DB_PORT),
            user=DB_USER, password=DB_PASS,
        )
        conn.cursor().execute(
            f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` "
            f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        conn.close()
        print(f"[DB] 数据库 '{DB_NAME}' 已就绪")
    except Exception as e:
        print(f"[DB] 数据库创建跳过（可能已存在）: {e}")

    # 2. 创建异步引擎与连接池
    engine = create_async_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_recycle=3600,
    )
    _session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # 3. 建表
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rooms (
                id          VARCHAR(64)  PRIMARY KEY,
                created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shapes (
                id           VARCHAR(36)  PRIMARY KEY,
                room_id      VARCHAR(64)   NOT NULL,
                user_id      VARCHAR(36)  NOT NULL,
                type         VARCHAR(20)  NOT NULL,
                color        VARCHAR(9)   NOT NULL DEFAULT '#3B82F6',
                stroke_width INT          NOT NULL DEFAULT 2,
                fill         VARCHAR(20)  DEFAULT 'transparent',
                locked       BOOLEAN      DEFAULT FALSE,
                group_id     VARCHAR(36),
                version      INT          DEFAULT 1,
                sort_order   INT          NOT NULL DEFAULT 0,
                geometry     JSON         NOT NULL,
                changed_fields JSON       DEFAULT NULL,
                created_at   BIGINT       NOT NULL,
                updated_at   BIGINT       NOT NULL,
                INDEX idx_room (room_id),
                INDEX idx_room_sort (room_id, sort_order),
                CONSTRAINT fk_shapes_room FOREIGN KEY (room_id)
                    REFERENCES rooms(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

    # 迁移：为已有数据库添加 changed_fields 列
    async with engine.begin() as conn:
        try:
            await conn.execute(text(
                "ALTER TABLE shapes ADD COLUMN changed_fields JSON DEFAULT NULL"
            ))
            print("[DB] migration: shapes.changed_fields added")
        except Exception:
            pass


async def close_db():
    """关闭数据库连接池"""
    global engine
    if engine:
        await engine.dispose()
        engine = None
        print("[DB] 连接池已关闭")


# ── 数据转换辅助函数 ──

# shape type 特有的几何字段列表
_GEOMETRY_FIELDS = {
    'x', 'y', 'width', 'height', 'radius', 'points', 'text', 'fontSize',
    'cornerRadius', 'skew', 'foldSize', 'imageData',
    'fromShapeId', 'toShapeId', 'fromEdge', 'toEdge', 'endArrow',
}


def _shape_to_row(shape: dict, room_id: str, sort_order: int, now: int) -> dict:
    """将前端 shape dict 拆分为数据库列 + geometry JSON"""
    geometry = {}
    for key in _GEOMETRY_FIELDS:
        if key in shape:
            geometry[key] = shape[key]

    # 提取本次变更涉及的字段列表（用于属性级冲突检测）
    changed_fields = [k for k in shape.keys() if k in _GEOMETRY_FIELDS and k in shape]

    return {
        'id': shape.get('id'),
        'room_id': room_id,
        'user_id': shape.get('userId', ''),
        'type': shape.get('type', ''),
        'color': shape.get('color', '#3B82F6'),
        'stroke_width': shape.get('strokeWidth', 2),
        'fill': shape.get('fill') if shape.get('fill') and shape['fill'] != 'transparent' else 'transparent',
        'locked': shape.get('locked', False),
        'group_id': shape.get('groupId'),
        'version': shape.get('version', 1),
        'sort_order': sort_order,
        'geometry': json.dumps(geometry, ensure_ascii=False),
        'changed_fields': json.dumps(changed_fields, ensure_ascii=False) if changed_fields else None,
        'created_at': shape.get('createdAt', now),
        'updated_at': now,
    }


def _row_to_shape(row) -> dict:
    """将数据库行还原为前端 Shape dict"""
    d = dict(row._mapping)
    geometry = json.loads(d.pop('geometry', '{}'))

    shape = {
        'id': d['id'],
        'type': d['type'],
        'userId': d['user_id'],
        'color': d['color'],
        'strokeWidth': d['stroke_width'],
        'createdAt': d['created_at'],
        'version': d['version'],
        'changedFields': d.get('changed_fields'),
    }
    if d.get('fill') and d['fill'] != 'transparent':
        shape['fill'] = d['fill']
    if d.get('locked'):
        shape['locked'] = True
    if d.get('group_id'):
        shape['groupId'] = d['group_id']
    shape.update(geometry)
    return shape
