import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Filter,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  Info,
  CheckCheck,
  Check,
  Clock,
  Star,
  Archive,
  Trash2,
  Tag,
  UserPlus,
  MessageCircle,
  Image,
  FileText,
  Mic,
} from "lucide-react";

const InboxPage = () => {
  const [selectedConversation, setSelectedConversation] = useState(0);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const conversations = [
    {
      id: 1,
      name: "Priya Sharma",
      phone: "+91 98765 43210",
      lastMessage: "Thanks for the quick response!",
      time: "5 min ago",
      unread: 3,
      starred: true,
      channel: "whatsapp",
      avatar: "PS",
    },
    {
      id: 2,
      name: "Amit Patel",
      phone: "+91 87654 32109",
      lastMessage: "When will my order be delivered?",
      time: "15 min ago",
      unread: 1,
      starred: false,
      channel: "whatsapp",
      avatar: "AP",
    },
    {
      id: 3,
      name: "Sneha Gupta",
      phone: "+91 76543 21098",
      lastMessage: "I'd like to know more about your services",
      time: "1 hour ago",
      unread: 0,
      starred: false,
      channel: "sms",
      avatar: "SG",
    },
    {
      id: 4,
      name: "Rahul Verma",
      phone: "+91 65432 10987",
      lastMessage: "Can I get a refund for my order?",
      time: "2 hours ago",
      unread: 0,
      starred: true,
      channel: "whatsapp",
      avatar: "RV",
    },
    {
      id: 5,
      name: "Kavita Singh",
      phone: "+91 54321 09876",
      lastMessage: "Thank you!",
      time: "3 hours ago",
      unread: 0,
      starred: false,
      channel: "whatsapp",
      avatar: "KS",
    },
    {
      id: 6,
      name: "Deepak Reddy",
      phone: "+91 43210 98765",
      lastMessage: "Please send the invoice",
      time: "5 hours ago",
      unread: 0,
      starred: false,
      channel: "sms",
      avatar: "DR",
    },
  ];

  const messages = [
    {
      id: 1,
      sender: "customer",
      text: "Hi, I placed an order yesterday. Order ID: #12345",
      time: "10:30 AM",
      status: "read",
    },
    {
      id: 2,
      sender: "agent",
      text: "Hello Priya! Thank you for reaching out. Let me check your order status.",
      time: "10:32 AM",
      status: "read",
    },
    {
      id: 3,
      sender: "agent",
      text: "I found your order. It's currently being processed and will be shipped within 24 hours.",
      time: "10:33 AM",
      status: "read",
    },
    {
      id: 4,
      sender: "customer",
      text: "That's great! Can you share the tracking details once it's shipped?",
      time: "10:35 AM",
      status: "read",
    },
    {
      id: 5,
      sender: "agent",
      text: "Absolutely! You'll receive an SMS and WhatsApp notification with tracking details as soon as the order is dispatched.",
      time: "10:36 AM",
      status: "read",
    },
    {
      id: 6,
      sender: "customer",
      text: "Thanks for the quick response!",
      time: "10:38 AM",
      status: "read",
    },
  ];

  const selectedChat = conversations[selectedConversation];

  const handleSendMessage = () => {
    if (message.trim()) {
      // Handle sending message
      setMessage("");
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "read":
        return <CheckCheck className="w-4 h-4 text-blue-500" />;
      case "delivered":
        return <CheckCheck className="w-4 h-4 text-slate-400" />;
      case "sent":
        return <Check className="w-4 h-4 text-slate-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="inbox-page">
      {/* Conversation List */}
      <div className="w-96 border-r border-slate-200 flex flex-col">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-heading font-semibold text-slate-900">Inbox</h2>
            <Badge className="bg-orange-500 hover:bg-orange-500 text-white">12</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search conversations..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="inbox-search"
              />
            </div>
            <Button variant="outline" size="icon" data-testid="inbox-filter-btn">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 p-4 border-b border-slate-200">
          <Button variant="default" size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
            All
          </Button>
          <Button variant="ghost" size="sm">Unread</Button>
          <Button variant="ghost" size="sm">Starred</Button>
          <Button variant="ghost" size="sm">Assigned</Button>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          {conversations.map((conversation, index) => (
            <div
              key={conversation.id}
              className={`p-4 border-b border-slate-100 cursor-pointer transition-colors ${
                selectedConversation === index ? "bg-orange-50 border-l-4 border-l-orange-500" : "hover:bg-slate-50"
              }`}
              onClick={() => setSelectedConversation(index)}
              data-testid={`conversation-${index}`}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white font-medium">
                      {conversation.avatar}
                    </AvatarFallback>
                  </Avatar>
                  {conversation.channel === "whatsapp" && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <MessageCircle className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 truncate">{conversation.name}</p>
                      {conversation.starred && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />}
                    </div>
                    <span className="text-xs text-slate-500">{conversation.time}</span>
                  </div>
                  <p className="text-sm text-slate-500 truncate">{conversation.lastMessage}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">{conversation.phone}</span>
                    {conversation.unread > 0 && (
                      <Badge className="bg-orange-500 hover:bg-orange-500 text-white text-xs h-5 min-w-5">
                        {conversation.unread}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="h-16 px-6 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white font-medium">
                {selectedChat.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-slate-900">{selectedChat.name}</p>
              <p className="text-sm text-slate-500">{selectedChat.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" data-testid="call-btn">
              <Phone className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" data-testid="video-btn">
              <Video className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" data-testid="info-btn">
              <Info className="w-5 h-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="chat-more-btn">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Star className="w-4 h-4 mr-2" /> Star conversation
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <UserPlus className="w-4 h-4 mr-2" /> Assign to agent
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Tag className="w-4 h-4 mr-2" /> Add label
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Archive className="w-4 h-4 mr-2" /> Archive
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6 bg-slate-50">
          <div className="space-y-4 max-w-3xl mx-auto">
            {/* Date Separator */}
            <div className="flex items-center justify-center">
              <span className="px-3 py-1 bg-white text-xs text-slate-500 rounded-full shadow-sm">
                Today
              </span>
            </div>

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "agent" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] ${
                    msg.sender === "agent"
                      ? "chat-bubble-sent text-slate-900"
                      : "chat-bubble-received text-slate-900"
                  } px-4 py-3`}
                >
                  <p className="text-sm">{msg.text}</p>
                  <div className={`flex items-center gap-1 mt-1 ${msg.sender === "agent" ? "justify-end" : ""}`}>
                    <span className="text-xs text-slate-500">{msg.time}</span>
                    {msg.sender === "agent" && getStatusIcon(msg.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Message Input */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-slate-500" data-testid="attach-btn">
                <Paperclip className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-slate-500" data-testid="image-btn">
                <Image className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-slate-500" data-testid="template-btn">
                <FileText className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 relative">
              <Textarea
                placeholder="Type a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[44px] max-h-32 resize-none pr-12"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                data-testid="message-input"
              />
              <Button variant="ghost" size="icon" className="absolute right-2 bottom-2 text-slate-500" data-testid="emoji-btn">
                <Smile className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-slate-500" data-testid="voice-btn">
                <Mic className="w-5 h-5" />
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleSendMessage}
                data-testid="send-btn"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Info Panel */}
      <div className="w-80 border-l border-slate-200 bg-white hidden xl:block">
        <div className="p-6">
          <div className="text-center mb-6">
            <Avatar className="w-20 h-20 mx-auto mb-4">
              <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white text-2xl font-medium">
                {selectedChat.avatar}
              </AvatarFallback>
            </Avatar>
            <h3 className="font-semibold text-slate-900 text-lg">{selectedChat.name}</h3>
            <p className="text-slate-500">{selectedChat.phone}</p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">Contact Info</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Email</span>
                  <span className="text-slate-900">priya@example.com</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Location</span>
                  <span className="text-slate-900">Mumbai, India</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Added</span>
                  <span className="text-slate-900">Jan 15, 2024</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">Labels</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Customer</Badge>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">VIP</Badge>
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Repeat Buyer</Badge>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">Recent Orders</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">#12345</span>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Delivered</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">#12289</span>
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">In Transit</Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboxPage;
