"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Paperclip,
  Mic,
  Square,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  CheckCheck,
  ArrowLeft,
  Search,
  LogOut,
  Loader2,
  WifiOff,
  FileText,
  X,
} from "lucide-react";
import { socket, connectSocket } from "../../lib/socket";
import { api, ApiError, clearSession, getStoredUser, getToken } from "../../lib/api";
import { useToast } from "../../components/Toast";
import ConfirmDialog from "../../components/ConfirmDialog";

interface User {
  _id: string;
  name: string;
  email: string;
  lastSeenAt: string | Date;
  state: "online" | "offline";
  typing?: boolean;
}

interface ChatUser extends User {
  lastMessage?: string;
  updatedAt: string | Date;
  unreadCount?: number;
}

interface Message {
  _id?: string;
  senderId: string;
  receiverId: string;
  message: string;
  isFile?: boolean;
  isVoice?: boolean;
  fileType?: string;
  fileName?: string;
  stats: string;
  isEdited?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function dayLabel(date: string | Date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export default function UserPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { notify } = useToast();

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sideBarTap, setSideBarTap] = useState<"chats" | "new chat">("chats");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [connected, setConnected] = useState(true);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const selectedUserRef = useRef<User | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser || storedUser._id !== userId) {
      clearSession();
      router.replace("/signPage");
      return;
    }

    setAuthChecked(true);
  }, [userId, router]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  useEffect(() => {
    notificationAudioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2357/2357-84.wav");
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!authChecked || !userId) return;
    let isMounted = true;

    async function fetchInitialData() {
      try {
        const [userData, allUsersData, chatsData] = await Promise.all([
          api.get(`/user/${userId}`),
          api.get(`/users`),
          api.get(`/chats/${userId}`),
        ]);

        if (isMounted) {
          setUser(userData.user);
          setAllUsers(allUsersData.users);
          setChats(chatsData.chats || []);
        }
      } catch (error) {
        if (error instanceof ApiError) notify(error.message, "error");
      }
    }

    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, [authChecked, userId, notify]);

  useEffect(() => {
    if (!authChecked || !userId) return;
    const token = getToken();
    if (!token) return;

    connectSocket(token);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleConnectError = () => {
      clearSession();
      router.replace("/signPage");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
    };
  }, [authChecked, userId, router]);

  useEffect(() => {
    if (!authChecked || !userId) return;

    const handleUsersUpdated = (users: User[]) => {
      const filtered = users.filter((u) => String(u._id) !== String(userId));
      setAllUsers(filtered);

      setChats((prevChats) =>
        prevChats.map((chat) => {
          const updatedUser = users.find((u) => String(u._id) === String(chat._id));
          return updatedUser
            ? { ...chat, state: updatedUser.state, name: updatedUser.name, email: updatedUser.email, lastSeenAt: updatedUser.lastSeenAt }
            : chat;
        })
      );

      setSelectedUser((prev) => {
        if (!prev) return null;
        return users.find((u) => String(u._id) === String(prev._id)) || prev;
      });
    };

    socket.on("usersUpdated", handleUsersUpdated);
    return () => {
      socket.off("usersUpdated", handleUsersUpdated);
    };
  }, [authChecked, userId]);

  useEffect(() => {
    if (!authChecked || !userId) return;

    const handleReceiveMessage = (newMessage: Message) => {
      const currentUserId = String(userId);
      const activeChatUserId = selectedUserRef.current ? String(selectedUserRef.current._id) : null;
      const msgSenderId = String(newMessage.senderId);
      const msgReceiverId = String(newMessage.receiverId);

      const isMessageFromActiveChat =
        (msgSenderId === activeChatUserId && msgReceiverId === currentUserId) ||
        (msgSenderId === currentUserId && msgReceiverId === activeChatUserId);

      if (isMessageFromActiveChat) {
        setMessages((prev) => {
          const exists = prev.some((m) => m._id === newMessage._id || (m.createdAt === newMessage.createdAt && m.message === newMessage.message));
          return exists ? prev : [...prev, newMessage];
        });

        if (msgSenderId !== String(userId)) {
          socket.emit("markAsSeen", { senderId: msgSenderId, receiverId: String(userId) });
        }
      } else if (msgSenderId !== currentUserId) {
        notificationAudioRef.current?.play().catch(() => {});

        const senderUser = allUsers.find((u) => String(u._id) === msgSenderId);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(senderUser?.name || "New message", {
            body: newMessage.isVoice ? "🎙️ Voice message" : newMessage.isFile ? `📁 ${newMessage.fileName}` : newMessage.message,
          });
        }
      }

      const otherUserId = msgSenderId === currentUserId ? msgReceiverId : msgSenderId;
      const displayText = newMessage.isVoice ? "🎙️ Voice message" : newMessage.isFile ? `📁 ${newMessage.fileName}` : newMessage.message;

      setChats((prevChats) => {
        const exists = prevChats.some((c) => String(c._id) === otherUserId);
        if (exists) {
          return prevChats.map((c) =>
            String(c._id) === otherUserId
              ? {
                  ...c,
                  lastMessage: displayText,
                  updatedAt: new Date(),
                  unreadCount: isMessageFromActiveChat ? 0 : (c.unreadCount || 0) + 1,
                }
              : c
          );
        }
        const targetUser = allUsers.find((u) => String(u._id) === otherUserId);
        if (targetUser) {
          return [
            {
              ...targetUser,
              lastMessage: displayText,
              updatedAt: new Date(),
              unreadCount: isMessageFromActiveChat ? 0 : 1,
            },
            ...prevChats,
          ];
        }
        return prevChats;
      });
    };

    const handleMessageEdited = ({ messageId, newMessageText }: { messageId: string; newMessageText: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, message: newMessageText, isEdited: true } : m))
      );

      setChats((prevChats) =>
        prevChats.map((c) => {
          if (selectedUserRef.current && String(c._id) === String(selectedUserRef.current._id)) {
            return { ...c, lastMessage: newMessageText, updatedAt: new Date() };
          }
          return c;
        })
      );
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => {
        const updatedMessages = prev.filter((m) => m._id !== messageId);

        setChats((prevChats) =>
          prevChats.map((c) => {
            if (selectedUserRef.current && String(c._id) === String(selectedUserRef.current._id)) {
              const lastMsg = updatedMessages[updatedMessages.length - 1];
              return {
                ...c,
                lastMessage: lastMsg ? (lastMsg.isVoice ? "🎙️ Voice message" : lastMsg.isFile ? `📁 ${lastMsg.fileName}` : lastMsg.message) : "🗑️ Deleted a message",
                updatedAt: new Date(),
              };
            }
            return c;
          })
        );

        return updatedMessages;
      });
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
    };
  }, [authChecked, userId, allUsers]);

  useEffect(() => {
    if (search.trim() === "") {
      setFilteredUsers(allUsers);
    } else {
      const lowerSearch = search.toLowerCase();
      setFilteredUsers(
        allUsers.filter((u) => u.name.toLowerCase().includes(lowerSearch) || u.email.toLowerCase().includes(lowerSearch))
      );
    }
  }, [search, allUsers]);

  useEffect(() => {
    if (!authChecked || !userId) return;

    const handleMessagesSeen = ({ senderId, receiverId }: { senderId: string; receiverId: string }) => {
      const activeChatUserId = selectedUserRef.current ? String(selectedUserRef.current._id) : null;

      if (activeChatUserId && String(senderId) === userId && String(receiverId) === activeChatUserId) {
        setMessages((prev) => prev.map((m) => (m.stats === "not seen" ? { ...m, stats: "seen" } : m)));
      }
    };

    socket.on("messagesSeen", handleMessagesSeen);
    return () => {
      socket.off("messagesSeen", handleMessagesSeen);
    };
  }, [authChecked, userId]);

  useEffect(() => {
    const handleTyping = ({ senderId, typing }: { senderId: string; typing: boolean }) => {
      setSelectedUser((prev) => {
        if (!prev || String(prev._id) !== String(senderId)) return prev;
        return { ...prev, typing };
      });

      setChats((prev) => prev.map((chat) => (String(chat._id) === String(senderId) ? { ...chat, typing } : chat)));
    };

    socket.on("typing", handleTyping);
    return () => {
      socket.off("typing", handleTyping);
    };
  }, []);

  async function openChat(target: User) {
    setSelectedUser({ ...target, typing: false });
    setChats((prev) => prev.map((chat) => (chat._id === target._id ? { ...chat, unreadCount: 0 } : chat)));

    try {
      const data = await api.get(`/messages?senderId=${userId}&receiverId=${target._id}`);
      setMessages(data.messages);
      socket.emit("markAsSeen", { senderId: target._id, receiverId: userId });
    } catch (error) {
      if (error instanceof ApiError) notify(error.message, "error");
    }
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedUser || !message.trim()) return;

    socket.emit("typing", { senderId: userId, receiverId: selectedUser._id, typing: false });

    const newMessageObj: Message = {
      senderId: String(user._id),
      receiverId: String(selectedUser._id),
      message: message,
      stats: "not seen",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    socket.emit("sendMessage", newMessageObj);
    setMessage("");
  }

  function submitEdit(messageId: string) {
    if (!editingText.trim() || !selectedUser) return;
    socket.emit("editMessage", {
      messageId,
      newMessageText: editingText,
      receiverId: selectedUser._id,
      senderId: userId,
    });
    setEditingMessageId(null);
    setEditingText("");
  }

  function confirmDelete() {
    if (!pendingDeleteId || !selectedUser) return;
    socket.emit("deleteMessage", {
      messageId: pendingDeleteId,
      receiverId: selectedUser._id,
      senderId: userId,
    });
    setPendingDeleteId(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedUser) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const data = await api.post("/upload", formData);
      const isVoiceFile = file.type.startsWith("audio/") || file.name.endsWith(".ogg") || file.name.endsWith(".mp3") || file.name.endsWith(".wav") || file.name.endsWith(".m4a");
      const newMessageObj: Message = {
        senderId: String(user._id),
        receiverId: String(selectedUser._id),
        message: data.url,
        isFile: true,
        isVoice: isVoiceFile,
        fileType: file.type,
        fileName: file.name,
        stats: "not seen",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      socket.emit("sendMessage", newMessageObj);
    } catch (error) {
      const messageText = error instanceof ApiError ? error.message : "Upload failed";
      notify(messageText, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify("Audio recording is not supported in this browser", "error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/ogg" });
        const audioFile = new File([audioBlob], `voice-${Date.now()}.ogg`, { type: "audio/ogg" });

        setUploading(true);
        const formData = new FormData();
        formData.append("file", audioFile);

        try {
          const data = await api.post("/upload", formData);
          if (user && selectedUser) {
            const newMessageObj: Message = {
              senderId: String(user._id),
              receiverId: String(selectedUser._id),
              message: data.url,
              isFile: true,
              isVoice: true,
              fileType: "audio/ogg",
              fileName: audioFile.name,
              stats: "not seen",
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            socket.emit("sendMessage", newMessageObj);
          }
        } catch (error) {
          const messageText = error instanceof ApiError ? error.message : "Voice upload failed";
          notify(messageText, "error");
        } finally {
          setUploading(false);
        }

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      notify("Microphone access denied", "error");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  function formatLastSeen(date: string | Date) {
    const lastSeen = new Date(date);
    const now = new Date();
    const isToday = lastSeen.toDateString() === now.toDateString();

    if (isToday) return lastSeen.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return lastSeen.toLocaleDateString("en-US");
  }

  function handleLogout() {
    socket.disconnect();
    clearSession();
    router.replace("/signPage");
  }

  if (!authChecked || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  let lastRenderedDay = "";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <AnimatePresence>
        {!connected && (
          <motion.div
            initial={{ y: -40 }}
            animate={{ y: 0 }}
            exit={{ y: -40 }}
            className="fixed top-0 inset-x-0 z-100 bg-amber-500/90 text-amber-950 text-sm font-semibold py-2 flex items-center justify-center gap-2"
          >
            <WifiOff className="w-4 h-4" /> Reconnecting…
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingDeleteId}
        title="Delete message"
        description="This message will be permanently removed for both of you."
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      <aside className={`w-full md:w-85 shadow-xl flex flex-col shrink-0 transition-all duration-300 bg-slate-900 border-r border-slate-800 ${selectedUser ? "hidden md:flex" : "flex"}`}>
        <div className="p-6 space-y-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Chats</h1>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-linear-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold shadow">
                {user.name?.charAt(0)}
              </div>
              <div className="hidden sm:block">
                <p className="font-semibold truncate max-w-25 text-slate-200">{user.name}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Log out"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
          <div className="flex p-1 rounded-xl bg-slate-800">
            <button onClick={() => setSideBarTap("chats")} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all text-white ${sideBarTap === "chats" ? "shadow-sm font-bold bg-slate-700" : "opacity-60 hover:opacity-100"}`}>Recent</button>
            <button onClick={() => setSideBarTap("new chat")} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all text-white ${sideBarTap === "new chat" ? "shadow-sm font-bold bg-slate-700" : "opacity-60 hover:opacity-100"}`}>New Chat</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sideBarTap === "chats" ? (
            chats.length === 0 ? (
              <p className="text-center text-sm mt-4 opacity-50">No active chats yet</p>
            ) : (
              [...chats]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .map((c) => (
                  <motion.button
                    layout
                    key={c._id}
                    onClick={() => openChat(c)}
                    className={`w-full text-left rounded-2xl p-4 transition-all duration-200 border ${selectedUser?._id === c._id ? "bg-blue-600 text-white border-blue-600 shadow-lg" : "bg-slate-800/40 border-slate-800 hover:shadow-md hover:bg-slate-800/60"}`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className={`font-semibold ${selectedUser?._id === c._id ? "text-white" : "text-slate-200"}`}>{c.name}</h2>
                      <div className="flex items-center gap-2">
                        {c.unreadCount && c.unreadCount > 0 && selectedUser?._id !== c._id ? (
                          <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{c.unreadCount}</span>
                        ) : null}
                        <span className={`w-2 h-2 rounded-full ${c.state === "online" ? "bg-emerald-500" : "bg-slate-600"}`} />
                      </div>
                    </div>
                    <p className={`text-sm mt-1 truncate ${selectedUser?._id === c._id ? "text-blue-100" : "text-slate-400"} ${c.unreadCount && c.unreadCount > 0 && selectedUser?._id !== c._id ? "font-bold text-white" : ""}`}>
                      {c.lastMessage || c.email}
                    </p>
                  </motion.button>
                ))
            )
          ) : (
            <>
              <div className="relative px-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:border-slate-500"
                />
              </div>
              {filteredUsers.map((u) => (
                <button
                  key={u._id}
                  onClick={() => openChat(u)}
                  className={`w-full text-left rounded-2xl p-4 transition-all duration-200 border ${selectedUser?._id === u._id ? "bg-blue-600 text-white border-blue-600 shadow-lg" : "bg-slate-800/40 border-slate-800 hover:shadow-md hover:bg-slate-800/60"}`}
                >
                  <div className="flex items-center justify-between">
                    <h2 className={`font-semibold ${selectedUser?._id === u._id ? "text-white" : "text-slate-200"}`}>{u.name}</h2>
                    <span className={`w-2 h-2 rounded-full ${u.state === "online" ? "bg-emerald-500" : "bg-slate-600"}`} />
                  </div>
                  <p className={`text-sm mt-1 ${selectedUser?._id === u._id ? "text-blue-100" : "text-slate-400"}`}>{u.email}</p>
                </button>
              ))}
            </>
          )}
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-300 ${!selectedUser ? "hidden md:flex" : "flex"}`}>
        {selectedUser ? (
          <div className="h-full flex flex-col w-full bg-slate-950">
            <div className="shadow-sm px-4 md:px-8 py-5 flex items-center justify-between bg-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-2 -ml-2 rounded-lg text-slate-400 hover:text-white">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                  {selectedUser.name?.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-white leading-tight">{selectedUser.name}</h2>
                  <p className="text-sm truncate max-w-45 sm:max-w-xs text-slate-400">{selectedUser.email}</p>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {selectedUser.state === "offline" && selectedUser.lastSeenAt && (
                  <p className="hidden sm:block text-xs text-slate-400">Last seen {formatLastSeen(selectedUser.lastSeenAt)}</p>
                )}
                <span className="font-semibold text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2 rounded-full bg-emerald-500/10 text-emerald-400">
                  {selectedUser.typing ? "Typing…" : selectedUser.state === "online" ? "Online" : "Offline"}
                </span>
              </div>
            </div>

            <div className="flex flex-col flex-1 p-4 md:p-8 overflow-y-auto space-y-1 bg-slate-950">
              {messages.map((m, index) => {
                const isMe = String(m.senderId) === String(userId);
                const msgId = m._id?.toString() ?? `temp-${index}`;
                const isEditingThis = editingMessageId === msgId;
                const currentDay = dayLabel(m.createdAt);
                const showDaySeparator = currentDay !== lastRenderedDay;
                lastRenderedDay = currentDay;

                return (
                  <div key={msgId}>
                    {showDaySeparator && (
                      <div className="flex items-center justify-center my-4">
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-900 border border-slate-800 rounded-full px-3 py-1">
                          {currentDay}
                        </span>
                      </div>
                    )}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className={`flex flex-col w-full group py-1.5 ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-2 max-w-[80%] sm:max-w-[70%] relative">
                        {isMe && !isEditingThis && (
                          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === msgId ? null : msgId);
                              }}
                              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            <AnimatePresence>
                              {activeMenuId === msgId && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="absolute right-0 bottom-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 w-32 z-50"
                                >
                                  {!m.isFile && (
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(msgId);
                                        setEditingText(m.message);
                                        setActiveMenuId(null);
                                      }}
                                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
                                    >
                                      <Pencil className="w-3.5 h-3.5" /> Edit
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setPendingDeleteId(msgId);
                                      setActiveMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-rose-400 hover:bg-slate-700"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        <div className={`px-4 py-3 rounded-2xl text-sm md:text-base shadow-sm wrap-break-word ${isMe ? "bg-blue-600 text-white rounded-tr-md" : "rounded-tl-md border bg-slate-900 border-slate-800 text-slate-100"}`}>
                          {isEditingThis ? (
                            <div className="flex flex-col gap-2 min-w-50">
                              <input
                                type="text"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full px-2 py-1 text-sm rounded bg-slate-700 text-white border border-slate-600 outline-none"
                                autoFocus
                              />
                              <div className="flex justify-end gap-1">
                                <button onClick={() => setEditingMessageId(null)} className="px-2 py-0.5 text-xs bg-slate-500 rounded hover:bg-slate-600">Cancel</button>
                                <button onClick={() => submitEdit(msgId)} className="px-2 py-0.5 text-xs bg-emerald-600 rounded hover:bg-emerald-700">Save</button>
                              </div>
                            </div>
                          ) : m.isFile ? (
                            m.isVoice ? (
                              <audio src={m.message} controls className="max-w-60 sm:max-w-xs audio-dark outline-none" />
                            ) : m.fileType?.startsWith("image/") ? (
                              <img
                                src={m.message}
                                alt={m.fileName}
                                className="w-full max-w-70 sm:max-w-xs h-auto max-h-60 object-cover rounded-lg cursor-pointer"
                                onClick={() => window.open(m.message, "_blank")}
                              />
                            ) : (
                              <a href={m.message} target="_blank" rel="noreferrer" className="underline flex items-center gap-2 text-indigo-300 hover:text-indigo-100">
                                <FileText className="w-4 h-4" /> {m.fileName || "Download file"}
                              </a>
                            )
                          ) : (
                            <span>{m.message}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 px-1 text-[10px] text-slate-500 font-medium">
                        {m.isEdited && <span className="italic text-slate-400">edited</span>}
                        {isMe && (
                          m.stats === "seen" ? (
                            <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )
                        )}
                      </div>
                    </motion.div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 md:p-5 bg-slate-900 border-t border-slate-800">
              <form onSubmit={sendMessage} className="flex gap-2 h-full items-center">
                <label className="p-3 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-700 transition duration-200 text-slate-300">
                  <input type="file" onChange={handleFileUpload} className="hidden" disabled={uploading || isRecording} />
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </label>

                <input
                  placeholder={uploading ? "Uploading…" : isRecording ? "Recording audio…" : "Type a message…"}
                  value={message}
                  disabled={uploading || isRecording}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (!selectedUser) return;
                    socket.emit("typing", { senderId: userId, receiverId: selectedUser._id, typing: true });
                    if (typingTimeout.current) clearTimeout(typingTimeout.current);
                    typingTimeout.current = setTimeout(() => {
                      socket.emit("typing", { senderId: userId, receiverId: selectedUser._id, typing: false });
                    }, 1000);
                  }}
                  className="w-full rounded-xl border px-4 py-3 outline-none bg-slate-800 border-slate-700 text-white focus:border-slate-500 disabled:opacity-50"
                />

                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={uploading}
                  className={`p-3 border rounded-xl transition duration-200 active:scale-95 ${isRecording ? "bg-red-600 border-red-600 animate-pulse text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"}`}
                >
                  {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <button
                  type="submit"
                  disabled={uploading || isRecording || !message.trim()}
                  className="bg-blue-600 text-white p-3 sm:px-6 rounded-xl font-bold hover:bg-blue-700 active:scale-95 shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center w-full bg-slate-950">
            <div className="text-center px-4">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-linear-to-br from-indigo-500 to-blue-600 mx-auto mb-6 flex items-center justify-center text-white shadow-xl">
                <Send className="w-9 h-9 md:w-10 md:h-10" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white">No conversation selected</h2>
              <p className="text-sm md:text-base mt-3 opacity-60">Pick someone from the sidebar to start chatting.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
