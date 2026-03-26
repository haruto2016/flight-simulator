import asyncio
import json
import websockets
import logging

logging.basicConfig(level=logging.INFO)

# 接続中のクライアントを管理する辞書 (websocket -> player_state)
# player_state には位置情報や姿勢情報を格納する
clients = {}
player_counter = [0]

async def handler(websocket):
    player_id = f"Player_{player_counter[0]}"
    player_counter[0] += 1
    
    # 接続直後にIDを通知
    await websocket.send(json.dumps({"type": "welcome", "id": player_id}))
    
    # 新規プレイヤーを登録
    clients[websocket] = {
        "id": player_id,
        "position": {"x": 0, "y": 3.5, "z": 350},
        "quaternion": {"x": 0, "y": 0, "z": 0, "w": 1},
        "gearDown": True,
        "flapAngle": 0
    }
    
    logging.info(f"{player_id} connected. Total players: {len(clients)}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data["type"] == "update":
                    # クライアントから送られてきた状態を更新
                    clients[websocket].update(data["state"])
            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        logging.info(f"{player_id} disconnected.")
        clients.pop(websocket, None)

async def broadcast_state():
    # 毎秒20回全クライアントへ状態を配信 (50msごとに実行)
    while True:
        if clients:
            players_data = list(clients.values())
            message = json.dumps({
                "type": "state",
                "players": players_data
            })
            # 並行して送信
            await asyncio.gather(*[ws.send(message) for ws in clients.keys()], return_exceptions=True)
        await asyncio.sleep(0.05)

async def main():
    logging.info("Starting WebSocket server on ws://0.0.0.0:8081")
    # サーバーの立ち上げとブロードキャストループの並行実行
    server = await websockets.serve(handler, "0.0.0.0", 8081)
    await asyncio.gather(
        server.wait_closed(),
        broadcast_state()
    )

if __name__ == "__main__":
    asyncio.run(main())
