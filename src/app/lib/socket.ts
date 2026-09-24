import { io } from "socket.io-client";

export const socket = io(process.env.NEXT_PUBLIC_API_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

export function connectSocket(token: string) {
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}
