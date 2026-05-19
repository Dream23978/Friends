import { useState, useRef, useEffect, useMemo, memo, ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Heart, 
  Send, 
  Wind, 
  Flame, 
  History, 
  Smile, 
  AlertCircle,
  X,
  Sparkles,
  Cloud,
  Moon,
  Sun,
  Trophy,
  BarChart,
  LogOut,
  User as UserIcon,
  Settings,
  Camera,
  Check,
  ChevronLeft,
  Shield,
  Activity,
  Quote,
  Zap
} from "lucide-react";
import { chatWithFriend, generateSticker, ChatMessage } from "./services/gemini";
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType, updateProfileData } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
  stickerUrl?: string;
  moodSummary?: {
    dominant_emotion: string;
    highlight: string;
    gentle_reminder: string;
  };
  isBurning?: boolean;
}

interface ChatSession {
  id: string;
  preview: string;
  timestamp: Date;
  mood?: string;
}

interface MoodEntry {
  id: string;
  mood: string;
  stickerUrl: string;
  timestamp: Date;
}

// Stabilize stars outside component to prevent flickering
const STARS = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  duration: 3 + Math.random() * 4,
  delay: Math.random() * 2,
  size: Math.random() * 2 + 1
}));

const BackgroundEffect = memo(({ isDarkMode }: { isDarkMode: boolean }) => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
    <AnimatePresence mode="wait">
      {isDarkMode ? (
        <motion.div
          key="dark-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0 bg-[#0F172A]"
        >
          {/* Optimized Stars - Using static CSS animation for better performance */}
          <style>{`
            @keyframes starPulse {
              0%, 100% { opacity: 0.2; }
              50% { opacity: 0.8; }
            }
            .animate-star {
              animation: starPulse infinite ease-in-out;
            }
          `}</style>
          {STARS.map((star) => (
            <div
              key={star.id}
              className="absolute bg-white rounded-full animate-star"
              style={{
                top: star.top,
                left: star.left,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.duration}s`
              }}
            />
          ))}
          <div className="absolute top-20 right-20 w-32 h-32 bg-indigo-500/10 rounded-full blur-[80px]" />
          
          {/* Moon */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="absolute top-12 left-12 w-20 h-20 md:w-32 md:h-32 z-0"
          >
            <div className="w-full h-full bg-[#F8FAFC] rounded-full shadow-[0_0_100px_rgba(226,232,240,0.3)] relative">
              <div className="absolute top-0 -left-1/4 w-full h-full bg-[#0F172A] rounded-full" />
            </div>
            <div className="absolute -inset-8 bg-indigo-400/5 rounded-full blur-3xl" />
          </motion.div>

          <div className="absolute bottom-20 left-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-[120px]" />
        </motion.div>
      ) : (
        <motion.div
          key="light-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0 bg-bg-primary"
        >
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-yellow-200/20 rounded-full blur-[150px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-coral-warm/10 rounded-full blur-[120px]" />
          
          {/* Simplified Sunbeams */}
          <div className="absolute top-[-20%] right-[-20%] w-[100%] h-[100%] opacity-20">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-1/2 left-1/2 w-[150%] h-[1px] bg-gradient-to-r from-transparent via-yellow-300 to-transparent origin-left"
                style={{ transform: `rotate(${i * 45}deg) translate(-50%, -50%)` }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
));

BackgroundEffect.displayName = "BackgroundEffect";

interface SidebarProps {
  user: User | null;
  profileData: any;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  isGeneratingMood: boolean;
  moods: { label: string; emoji: string; prompt: string; }[];
  moodHistory: MoodEntry[];
  chatHistory: ChatSession[];
  handleMoodSelect: (mood: any) => void;
  setIsLanding: (val: boolean) => void;
  setIsMobileMenuOpen: (val: boolean) => void;
  setShowSafeSpace: (val: boolean) => void;
  startSOS: () => void;
  startDumpAndBurn: () => void;
  handleSend: (text: string) => void;
  handleLogout: () => void;
  onEditProfile: () => void;
}

const SidebarContent = memo(({
  user,
  profileData,
  isDarkMode,
  setIsDarkMode,
  isGeneratingMood,
  moods,
  moodHistory,
  chatHistory,
  handleMoodSelect,
  setIsLanding,
  setIsMobileMenuOpen,
  setShowSafeSpace,
  startSOS,
  startDumpAndBurn,
  handleSend,
  handleLogout,
  onEditProfile
}: SidebarProps) => (
  <div className="flex flex-col h-full overflow-hidden relative">
    {/* Sticky Sidebar Header */}
    <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#0F172A]/80 backdrop-blur-md pt-0 pb-6 mb-6 border-b border-white/5 dark:border-white/5 transition-all">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="inline-block px-5 py-2 rounded-2xl text-3xl font-serif italic font-medium tracking-tight text-[#4A5759] dark:text-white dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.7)] dark:[text-shadow:0_0_20px_rgba(255,255,255,0.3)] transition-all duration-1000">Friend</h1>
          <p className="mt-4 text-sm text-muted dark:text-[#94A3B8] font-medium uppercase tracking-widest flex items-center gap-2">
            <Heart size={14} className="text-coral-warm fill-coral-warm" />
            Wellness Companion
          </p>
        </div>
      </div>
    </div>

    <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
      {/* User Mini Profile */}
      {user && (
        <div className="p-4 bg-white/50 dark:bg-slate-900/40 rounded-3xl border border-border-subtle dark:border-white/10 flex items-center gap-4 group hover:bg-white/80 dark:hover:bg-slate-900/60 transition-all dark:shadow-[0_0_20px_rgba(99,102,241,0.05)]">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-friend-light dark:bg-indigo-900/30 shrink-0 border-2 border-white dark:border-white/20 dark:shadow-[0_0_10px_rgba(255,255,255,0.1)]">
            {profileData?.photoURL || user.photoURL ? (
              <img src={profileData?.photoURL || user.photoURL || ""} className="w-full h-full object-cover" alt="Profile" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#4A5759] dark:text-[#E2E8F0]">
                <UserIcon size={20} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#4A5759] dark:text-[#F8FAFC] truncate">{profileData?.displayName || user.displayName || "Pengguna"}</p>
            <p className="text-[10px] text-muted dark:text-[#94A3B8] font-medium tracking-wide uppercase truncate italic">
              {profileData?.motivation || "No motivation yet ✨"}
            </p>
          </div>
          <button 
            onClick={() => { onEditProfile(); setIsMobileMenuOpen(false); }}
            className="p-2 text-muted hover:text-friend-bg dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Settings size={16} />
          </button>
        </div>
      )}

      <nav className="space-y-8 pb-4">
        <div className="space-y-4">
          <p className="text-xs font-bold text-[#D1D1CB] dark:text-[#334155] uppercase tracking-widest">Pelacak Mood</p>
          <div className="grid grid-cols-5 gap-2">
            {moods.map((m) => (
              <button
                key={m.label}
                onClick={() => {
                  handleMoodSelect(m);
                  setIsMobileMenuOpen(false);
                }}
                disabled={isGeneratingMood}
                className="flex flex-col items-center p-2 rounded-xl transition-all hover:bg-subtle-bg dark:hover:bg-white/5 group disabled:opacity-50"
              >
                <span className="text-xl group-hover:scale-125 transition-transform">{m.emoji}</span>
                <span className="text-[9px] mt-1 font-bold text-muted dark:text-[#64748B] uppercase">{m.label}</span>
              </button>
            ))}
          </div>
          {isGeneratingMood && (
            <div className="flex items-center gap-2 text-[10px] text-friend-bg dark:text-indigo-400 font-bold animate-pulse">
              <Sparkles size={10} /> Lagi dibuat...
            </div>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-xs font-bold text-[#D1D1CB] dark:text-[#334155] uppercase tracking-widest">Aksi Cepat</p>
            <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => { setShowSafeSpace(true); setIsMobileMenuOpen(false); }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-indigo-400/20 bg-indigo-400/5 text-indigo-400 hover:bg-indigo-400 hover:text-white transition-all gap-2 dark:shadow-[0_0_15px_rgba(129,140,248,0.1)]"
            >
              <Shield size={20} className="dark:drop-shadow-[0_0_5px_rgba(129,140,248,0.5)]" />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-center leading-none">Safe Space</span>
            </button>
            <button 
              onClick={() => { startSOS(); setIsMobileMenuOpen(false); }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-coral-warm/20 bg-coral-warm/5 text-coral-warm hover:bg-coral-warm hover:text-white transition-all gap-2 dark:shadow-[0_0_15px_rgba(255,111,97,0.1)]"
            >
              <AlertCircle size={20} className="dark:drop-shadow-[0_0_5px_rgba(255,111,97,0.5)]" />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-center leading-none">SOS Grounding</span>
            </button>
            <button 
              onClick={() => { startDumpAndBurn(); setIsMobileMenuOpen(false); }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-friend-bg/20 bg-friend-bg/5 text-friend-bg hover:bg-friend-bg hover:text-white transition-all gap-2 dark:shadow-[0_0_15px_rgba(74,87,89,0.1)]"
            >
              <Flame size={20} />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-center leading-none">Luapkan & Bakar</span>
            </button>
            <button 
              onClick={() => { handleSend("Kasih ringkasan mood gw minggu ini dong."); setIsMobileMenuOpen(false); }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-sand-medium/20 bg-sand-medium/5 text-sand-medium hover:bg-sand-medium hover:text-white transition-all gap-2 dark:shadow-[0_0_15px_rgba(168,162,158,0.1)]"
            >
              <BarChart size={20} className="dark:drop-shadow-[0_0_5px_rgba(168,162,158,0.5)]" />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-center leading-none">Rangkuman Mingguan</span>
            </button>
            <button 
              onClick={() => { handleSend("Lagi butuh selebrasi kecil, nih."); setIsMobileMenuOpen(false); }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-olive-deep/20 bg-olive-deep/5 text-olive-deep hover:bg-olive-deep hover:text-white transition-all gap-2 dark:shadow-[0_0_15px_rgba(74,87,89,0.1)]"
            >
              <Trophy size={20} />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-center leading-none">Rayakan Keberhasilan</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-bold text-[#D1D1CB] dark:text-[#334155] uppercase tracking-widest">Jurnal</p>
          <div className="space-y-4">
            {moodHistory.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 p-3 bg-subtle-bg dark:bg-black/20 rounded-2xl border border-[#F2F0EB] dark:border-white/5 animate-fade-in transition-colors">
                <img src={entry.stickerUrl} className="w-10 h-10 rounded-lg object-cover bg-white shadow-sm" alt={entry.mood} />
                <div>
                  <p className="text-sm font-semibold dark:text-[#E2E8F0]">Mood: {entry.mood}</p>
                  <p className="text-[11px] text-muted dark:text-[#94A3B8]">{entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
            {!moodHistory.length && (
              <div className="flex items-center gap-3 p-3 bg-subtle-bg dark:bg-black/20 rounded-2xl border border-[#F2F0EB] dark:border-white/5 transition-colors">
                <div className="w-10 h-10 rounded-full bg-friend-light dark:bg-indigo-900/30 flex items-center justify-center text-xl">☁️</div>
                <div>
                  <p className="text-sm font-semibold dark:text-[#E2E8F0]">Belum Ada Catatan</p>
                  <p className="text-[11px] text-muted dark:text-[#94A3B8]">Yuk, mulai cerita hari ini.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>

    <div className="p-6 bg-[#EDEDE9] dark:bg-black/20 rounded-3xl mt-8 transition-colors shrink-0 dark:shadow-[0_0_20px_rgba(255,255,255,0.03)] border dark:border-white/5 overflow-hidden">
      <p className="text-xs font-bold text-[#A3A39D] dark:text-[#334155] uppercase tracking-widest mb-4 flex items-center gap-2">
        <Activity size={14} /> Cerita kamu
      </p>
      <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
        {chatHistory.map((story) => (
          <div key={story.id} className="group cursor-pointer" onClick={() => handleSend(`Inget cerita gw tentang "${story.preview}"?`)}>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-friend-bg dark:bg-indigo-400 mt-1.5 shrink-0 group-hover:scale-150 transition-transform" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-[#4A5759] dark:text-[#E2E8F0] truncate group-hover:text-friend-bg dark:group-hover:text-indigo-300 transition-colors">
                  {story.preview}
                </p>
                <p className="text-[9px] text-muted dark:text-[#64748B] font-bold uppercase tracking-tighter">
                  {story.timestamp.toLocaleDateString([], { day: 'numeric', month: 'short' })} • {story.mood || "✨"}
                </p>
              </div>
            </div>
          </div>
        ))}
        {!chatHistory.length && (
          <p className="text-[10px] text-muted dark:text-[#64748B] italic">Belum ada cerita tersimpan. Yuk ngobrol!</p>
        )}
      </div>
    </div>

    <div className="mt-4 flex flex-col gap-2 shrink-0">
      <div className="flex gap-2">
          <button
            onClick={() => {
              setIsLanding(true);
              setIsMobileMenuOpen(false);
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-border-subtle dark:border-white/10 text-muted dark:text-[#94A3B8] hover:text-[#4A5759] dark:hover:text-white hover:bg-subtle-bg dark:hover:bg-slate-900/40 transition-all text-xs font-bold uppercase tracking-widest dark:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
          >
            <Moon size={14} className="dark:drop-shadow-[0_0_3px_rgba(255,255,255,0.5)]" /> Kembali ke Awal
          </button>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-3 rounded-2xl border border-border-subtle dark:border-white/10 text-[#4A5759] dark:text-[#E2E8F0] hover:bg-subtle-bg dark:hover:bg-slate-900/40 transition-all dark:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={18} className="dark:drop-shadow-[0_0_5px_rgba(253,224,71,0.5)]" /> : <Moon size={18} />}
          </button>
      </div>
      
      {user && (
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all text-xs font-bold uppercase tracking-widest"
        >
          <LogOut size={14} /> Keluar
        </button>
      )}
    </div>
  </div>
));

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLanding, setIsLanding] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMood, setIsGeneratingMood] = useState(false);
  const [showGrounding, setShowGrounding] = useState(false);
  const [showSafeSpace, setShowSafeSpace] = useState(false);
  const [isBurningMode, setIsBurningMode] = useState(false);
  const [consecutiveDays, setConsecutiveDays] = useState(12);
  const [moodHistory, setMoodHistory] = useState<MoodEntry[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      if (currUser) {
        setIsLanding(false);
        // Initial profile fetch
        const userDocRef = doc(db, 'users', currUser.uid);
        const userDocSnapshot = await getDoc(userDocRef);
        if (userDocSnapshot.exists()) {
          setProfileData(userDocSnapshot.data());
        }

        // Setup real-time listener for profile
        const unsubProfile = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            setProfileData(doc.data());
          }
        });
        return () => unsubProfile();
      } else {
        setProfileData(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Mood History Listener from Firestore
  useEffect(() => {
    if (!user) {
      setMoodHistory([]);
      return;
    }

    const path = `users/${user.uid}/mood_history`;
    const q = query(collection(db, path), orderBy("timestamp", "desc"), limit(5));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: MoodEntry[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          mood: data.mood,
          stickerUrl: data.stickerUrl,
          timestamp: data.timestamp?.toDate() || new Date()
        };
      });
      setMoodHistory(entries);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Chat History Listener from Firestore
  useEffect(() => {
    if (!user) {
      setChatHistory([]);
      return;
    }

    const path = `users/${user.uid}/chat_sessions`;
    const q = query(collection(db, path), orderBy("timestamp", "desc"), limit(10));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: ChatSession[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          preview: data.preview,
          mood: data.mood,
          timestamp: data.timestamp?.toDate() || new Date()
        };
      });
      setChatHistory(entries);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const moods = [
    { label: "Happy", emoji: "😊", prompt: "cute chibi character, very happy, big eyes, sparkles, pastel colors, sticker style, white border, minimalist" },
    { label: "Sad", emoji: "🥺", prompt: "cute chibi character, sad, teary eyes, holding a small rain cloud, pastel blues, sticker style, white border, minimalist" },
    { label: "Angry", emoji: "😤", prompt: "cute chibi character, grumpy, small steam clouds from ears, cheeks puffed, pastel reds, sticker style, white border, minimalist" },
    { label: "Tired", emoji: "😴", prompt: "cute chibi character, sleepy, wearing cozy pajamas, eyes half closed, pastel purples, sticker style, white border, minimalist" },
    { label: "Anxious", emoji: "😰", prompt: "cute chibi character, worried, small sweat drop, biting lip, pastel greens, sticker style, white border, minimalist" },
  ];

  const compressSticker = async (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 400; // Sufficient for stickers
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Use white background for stickers to avoid JPEG black background on transparency
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }
        
        // JPEG 0.7 is very small and fits well under 1MB
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(base64Str); // Fallback to original
      img.src = base64Str;
    });
  };

  const handleMoodSelect = async (mood: typeof moods[0]) => {
    if (isGeneratingMood) return;
    setIsGeneratingMood(true);
    
    try {
      let url = await generateSticker(mood.prompt);
      url = await compressSticker(url);
      
      // Save to Firestore if user is logged in
      if (user) {
        const path = `users/${user.uid}/mood_history`;
        try {
          await addDoc(collection(db, path), {
            userId: user.uid,
            mood: mood.label,
            stickerUrl: url,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      } else {
        // Fallback for non-logged in (though landing page should block this)
        const newMood: MoodEntry = {
          id: Date.now().toString(),
          mood: mood.label,
          stickerUrl: url,
          timestamp: new Date()
        };
        setMoodHistory(prev => [newMood, ...prev].slice(0, 5));
      }
      
      const modelMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: `Gw catet ya, hari ini lo lagi ngerasa ${mood.label.toLowerCase()}. Nih, stiker lucu buat lo biar nemenin hari lo!`,
        timestamp: new Date(),
        stickerUrl: url
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingMood(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
      setIsLanding(false);
    } catch (error: any) {
      console.error("Login failed:", error);
      // Detailed error for common Firebase issues
      let friendlyMsg = error.message || "Pastikan domain ini sudah terdaftar di Authorized Domains Firebase Console.";
      if (error.code === 'auth/popup-blocked') {
        friendlyMsg = "Popup terblokir oleh browser. Coba aktifkan popup atau gunakan browser lain.";
      } else if (error.code === 'auth/unauthorized-domain') {
        friendlyMsg = "Domain ini belum diizinkan untuk login. Hubungi admin atau tambahkan domain ini ke Firebase Console.";
      } else if (error.code === 'auth/operation-not-allowed') {
        friendlyMsg = "Metode login Google belum diaktifkan di Firebase Console.";
      }
      alert(`Login gagal (${error.code || 'unknown'}): ${friendlyMsg}\n\nTips: Jika ini di website baru, pastikan domain ini (${window.location.hostname}) sudah terdaftar di Authorized Domains di Firebase Console.`);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsLanding(true);
      setMessages([]);
      setHistory([]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    const greet = async () => {
      const initialGreet = "Yo! Akhirnya lo dateng juga. Hari ini kelar ngapain aja lo? Ada hal seru atau malah bikin males?";
      setMessages([{
        id: "initial",
        role: "model",
        text: initialGreet,
        timestamp: new Date()
      }]);
    };
    greet();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || inputValue;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const responseText = await chatWithFriend(history, textToSend);
      
      const stickerMatch = responseText.match(/\[GENERATE_STICKER: (.*?)\]/);
      const groundingMatch = responseText.match(/\[TRIGGER_GROUNDING\]/);
      const safeSpaceMatch = responseText.match(/\[TRIGGER_SAFE_SPACE\]/);
      const moodSummaryMatch = responseText.match(/\[MOOD_SUMMARY: (.*?)\]/s);
      
      let stickerUrl = undefined;
      let moodSummary = undefined;
      let cleanText = responseText
        .replace(/\[GENERATE_STICKER: .*?\]/, "")
        .replace(/\[TRIGGER_GROUNDING\]/, "")
        .replace(/\[TRIGGER_SAFE_SPACE\]/, "")
        .replace(/\[MOOD_SUMMARY: .*?\]/s, "")
        .trim();

      if (groundingMatch) {
        setShowGrounding(true);
      }

      if (safeSpaceMatch) {
        setShowSafeSpace(true);
      }

      if (moodSummaryMatch) {
        try {
          moodSummary = JSON.parse(moodSummaryMatch[1]);
        } catch (err) {
          console.error("Failed to parse mood summary", err);
        }
      }

      if (stickerMatch) {
        try {
          const rawUrl = await generateSticker(stickerMatch[1]);
          stickerUrl = await compressSticker(rawUrl);
        } catch (err) {
          console.error("Sticker generation failed", err);
        }
      }

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: cleanText,
        timestamp: new Date(),
        stickerUrl,
        moodSummary
      };

      // Save chat session/summary to Firestore if logged in
      if (user && !customMessage) { // Don't save internal/action-triggered messages as separate stories usually
        const path = `users/${user.uid}/chat_sessions`;
        try {
          await addDoc(collection(db, path), {
            userId: user.uid,
            preview: textToSend.length > 50 ? textToSend.substring(0, 50) + "..." : textToSend,
            mood: moodSummary?.dominant_emotion || null,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      }

      setMessages(prev => [...prev, modelMessage]);
      setHistory(prev => [
        ...prev,
        { role: "user", parts: [{ text: textToSend }] },
        { role: "model", parts: [{ text: responseText }] }
      ]);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: "Duh, sori banget, gw lagi agak nge-blank nih. Sinyalnya kali ya? Coba lagi deh.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const startSOS = () => {
    setShowGrounding(true);
    handleSend("SOS Grounding / Gue panik banget.");
  };

  const startDumpAndBurn = () => {
    setIsBurningMode(true);
    handleSend("Dump & Burn / Mau ngeluapin emosi.");
  };

  const burnMessages = () => {
    setMessages(prev => prev.map(m => ({ ...m, isBurning: true })));
    setTimeout(() => {
      setMessages([]);
      setIsBurningMode(false);
      const botMsg: Message = {
        id: Date.now().toString(),
        role: "model",
        text: "Lega? Udah gw bakar semua kekesalan lo. Semoga jadi lebih enteng ya perasaan lo. ✨",
        timestamp: new Date()
      };
      setMessages([botMsg]);
    }, 2000);
  };

  const Sidebar = () => (
    <SidebarContent 
      user={user}
      profileData={profileData}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      isGeneratingMood={isGeneratingMood}
      moods={moods}
      moodHistory={moodHistory}
      chatHistory={chatHistory}
      handleMoodSelect={handleMoodSelect}
      setIsLanding={setIsLanding}
      setIsMobileMenuOpen={setIsMobileMenuOpen}
      setShowSafeSpace={setShowSafeSpace}
      startSOS={startSOS}
      startDumpAndBurn={startDumpAndBurn}
      handleSend={handleSend}
      handleLogout={handleLogout}
      onEditProfile={() => setIsEditingProfile(true)}
    />
  );

  const EditProfileView = () => {
    const [editName, setEditName] = useState(profileData?.displayName || user?.displayName || "");
    const [editEmail, setEditEmail] = useState(profileData?.email || user?.email || "");
    const [editMotivation, setEditMotivation] = useState(profileData?.motivation || "");
    const [editPhoto, setEditPhoto] = useState(profileData?.photoURL || user?.photoURL || "");
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const compressed = await compressSticker(base64); // Reuse compression logic
        setEditPhoto(compressed);
      };
      reader.readAsDataURL(file);
    };

    const handleSave = async () => {
      if (!user) return;
      
      // Optimistic Update: Update local state immediately
      const newData = {
        displayName: editName,
        email: editEmail,
        motivation: editMotivation,
        photoURL: editPhoto
      };
      
      setProfileData((prev: any) => ({ ...prev, ...newData }));
      setIsEditingProfile(false); // Close UI immediately
      
      // Perform background update
      try {
        await updateProfileData(user.uid, newData);
      } catch (err) {
        console.error("Background save failed", err);
        // Optional: Revert state if it's critical, but usually for profile it's fine
        // as the real-time listener will sync it back anyway if there's a conflict
      }
    };

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full animate-fade-in">
        <button 
          onClick={() => setIsEditingProfile(false)}
          className="absolute top-8 left-8 p-3 rounded-2xl bg-white/50 dark:bg-slate-900/40 border border-border-subtle dark:border-white/10 text-muted dark:text-[#E2E8F0] hover:text-friend-bg transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest"
        >
          <div className="flex items-center gap-2">
            <ChevronLeft size={16} /> Kembali
          </div>
        </button>

        <div className="w-full space-y-8 bg-white/80 dark:bg-[#1E293B]/50 backdrop-blur-xl p-8 md:p-12 rounded-[2.5rem] border border-border-subtle dark:border-white/10 shadow-2xl">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-serif italic text-[#4A5759] dark:text-white dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">Edit Profil</h2>
            <p className="text-xs text-muted dark:text-[#94A3B8] font-bold uppercase tracking-widest">Atur cara Friend menyapa lo</p>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="relative group">
              <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 border-white dark:border-[#0F172A] shadow-xl bg-friend-light dark:bg-indigo-900/30">
                {editPhoto ? (
                  <img src={editPhoto} className="w-full h-full object-cover" alt="Profile preview" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#4A5759] dark:text-[#E2E8F0]">
                    <UserIcon size={40} />
                  </div>
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 p-3 bg-friend-bg text-white rounded-2xl shadow-lg hover:scale-110 transition-all"
              >
                <Camera size={20} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                className="hidden" 
                accept="image/*" 
              />
            </div>

            <div className="w-full space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted dark:text-[#64748B] uppercase tracking-widest pl-2">Nama Pengguna</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Panggil gue apa?"
                  className="w-full px-6 py-4 rounded-2xl bg-white/50 dark:bg-[#0F172A]/50 border border-border-subtle dark:border-white/10 text-[#4A5759] dark:text-[#E2E8F0] focus:ring-2 focus:ring-friend-bg/20 outline-none transition-all font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted dark:text-[#64748B] uppercase tracking-widest pl-2">Email</label>
                <input 
                  type="email" 
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Email lo?"
                  className="w-full px-6 py-4 rounded-2xl bg-white/50 dark:bg-[#0F172A]/50 border border-border-subtle dark:border-white/10 text-[#4A5759] dark:text-[#E2E8F0] focus:ring-2 focus:ring-friend-bg/20 outline-none transition-all font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted dark:text-[#64748B] uppercase tracking-widest pl-2">Motivasi Singkat</label>
                <textarea 
                  value={editMotivation}
                  onChange={(e) => setEditMotivation(e.target.value)}
                  placeholder="Apa motivasi lo?"
                  rows={2}
                  className="w-full px-6 py-4 rounded-2xl bg-white/50 dark:bg-[#0F172A]/50 border border-border-subtle dark:border-white/10 text-[#4A5759] dark:text-[#E2E8F0] focus:ring-2 focus:ring-friend-bg/20 outline-none transition-all font-medium resize-none"
                />
              </div>
            </div>

            <div className="w-full pt-4 flex gap-4">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="flex-1 px-8 py-4 rounded-2xl border border-border-subtle dark:border-white/10 text-muted dark:text-[#94A3B8] font-bold text-xs uppercase tracking-widest hover:bg-subtle-bg dark:hover:bg-white/5 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[2] relative px-8 py-4 bg-friend-bg text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? <Sparkles size={16} className="animate-spin" /> : <Check size={16} />}
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex h-screen h-[100dvh] w-full overflow-hidden transition-colors duration-500 ${isDarkMode ? "dark" : ""}`}>
      <BackgroundEffect isDarkMode={isDarkMode} />
      
      <AnimatePresence mode="wait">
        {isLanding ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-transparent overflow-y-auto"
          >
            <div className="absolute top-4 md:top-8 right-4 md:right-8 z-[60]">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-3 md:p-4 rounded-2xl bg-white/50 dark:bg-slate-900/40 border border-border-subtle dark:border-white/10 text-[#4A5759] dark:text-[#E2E8F0] hover:bg-white dark:hover:bg-slate-900/60 transition-all shadow-sm"
                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDarkMode ? <Sun size={20} md:size={24} /> : <Moon size={20} md:size={24} />}
              </button>
            </div>

            <div className="text-center space-y-6 md:space-y-12 max-w-sm md:max-w-lg w-full relative z-10 py-10">
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="relative inline-block"
              >
                <div className={`absolute inset-0 ${isDarkMode ? "bg-indigo-300" : "bg-yellow-200"} blur-3xl opacity-30 rounded-full transition-all duration-1000`} />
                <div className="relative w-24 h-24 md:w-32 md:h-32 bg-white dark:bg-[#1E293B] rounded-full flex items-center justify-center border-6 md:border-8 border-white dark:border-[#1E293B] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_0_50px_rgba(255,255,255,0.2)] overflow-hidden transition-all duration-1000">
                  <Smile size={60} md:size={80} className={`${isDarkMode ? "text-white dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" : "text-yellow-400 fill-yellow-50"}`} strokeWidth={1.5} />
                </div>
              </motion.div>
              
              <div className="space-y-3 md:space-y-4 px-4">
                <h1 className="text-5xl md:text-7xl font-serif italic text-[#4A5759] dark:text-white dark:drop-shadow-[0_0_25px_rgba(255,255,255,0.8)] transition-all duration-1000">Friend</h1>
                <p className="text-sm md:text-lg text-muted dark:text-[#94A3B8] font-light leading-relaxed max-w-[280px] md:max-w-none mx-auto">
                  Tarik napas sejenak. <br />
                  Gue di sini buat dengerin apa pun yang ada di pikiran lo.
                </p>
              </div>

              <div className="px-6 md:px-4">
                <button
                  onClick={handleLogin}
                  className="group relative w-full max-w-[280px] md:max-w-none px-6 py-4 md:py-5 bg-friend-bg text-white rounded-full font-bold tracking-[0.1em] md:tracking-[0.2em] uppercase shadow-lg hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 overflow-hidden flex items-center justify-center gap-3 md:gap-4 mx-auto"
                >
                  <div className="relative z-10 p-1 bg-white rounded-full flex items-center justify-center shrink-0">
                    <img src="https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png" className="w-5 h-5 md:w-6 md:h-6" alt="Google" />
                  </div>
                  <span className="relative z-10 whitespace-nowrap text-sm md:text-base">Masuk via Google</span>
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
              </div>

              <div className="flex gap-4 justify-center pt-4 md:pt-8 opacity-40">
                <Smile size={18} md:size={20} className="text-[#4A5759] dark:text-[#E2E8F0]" />
                <div className="w-1.5 h-1.5 rounded-full bg-border-subtle dark:bg-white/20 my-auto" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#4A5759] dark:text-[#E2E8F0]">Secure & Private</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full w-full relative z-10"
          >
            {/* Mobile Drawer Overlay */}
            <AnimatePresence>
              {isMobileMenuOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40 md:hidden"
                  />
                  <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed inset-y-0 left-0 w-[80%] max-w-sm bg-white dark:bg-gradient-to-b dark:from-[#0F172A]/95 dark:to-[#1E293B]/95 dark:shadow-[5px_0_50px_rgba(165,180,252,0.15)] backdrop-blur-xl z-50 p-8 shadow-2xl md:hidden transition-all duration-700"
                  >
                    <button 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="absolute top-8 right-8 text-muted dark:text-[#94A3B8]"
                    >
                      <X size={24} />
                    </button>
                    <Sidebar />
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Desktop Sidebar */}
            <aside className="w-80 border-r border-border-subtle dark:border-indigo-400/30 bg-white/80 dark:bg-gradient-to-b dark:from-[#0F172A]/95 dark:to-[#1E293B]/95 dark:shadow-[inset_-1px_0_40px_rgba(165,180,252,0.1),_0_0_20px_rgba(99,102,241,0.05)] backdrop-blur-md p-8 flex flex-col justify-between hidden md:flex transition-all duration-700">
              <Sidebar />
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col relative max-w-4xl mx-auto w-full px-4 md:px-12 pb-2 md:pb-6 h-full overflow-hidden">
              {isEditingProfile ? (
                <EditProfileView />
              ) : (
                <>
                  {/* Sticky Top Navbar */}
                  <header className="sticky top-0 z-20 -mx-4 md:-mx-12 px-4 md:px-12 py-3 md:py-4 bg-white/60 dark:bg-[#0F172A]/70 backdrop-blur-xl border-b border-border-subtle dark:border-white/10 flex items-center justify-between transition-all duration-500 shadow-sm mb-4 md:mb-6">
                    <div className="flex items-center gap-2 md:gap-4">
                      <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="md:hidden p-2 -ml-2 text-[#4A5759] dark:text-[#E2E8F0] hover:bg-subtle-bg dark:hover:bg-white/5 rounded-full transition-colors"
                      >
                        <Smile size={20} md:size={24} />
                      </button>
                      <h1 className="px-2 md:px-4 py-1 rounded-2xl text-lg md:text-2xl font-serif italic text-[#4A5759] dark:text-white dark:drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">Friend</h1>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:block text-[10px] font-bold text-muted dark:text-[#64748B] uppercase tracking-widest">
                        Wellness Companion
                      </div>
                      <div className="bg-[#EDEDE9] dark:bg-[#1E293B] px-3 py-1 rounded-full text-xs font-bold text-[#4A5759] dark:text-[#E2E8F0] shadow-inner transition-colors">
                        {consecutiveDays} hari
                      </div>
                      {user && (
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 ml-2 shadow-sm bg-subtle-bg dark:bg-slate-900/60">
                          {profileData?.photoURL || user.photoURL ? (
                            <img src={profileData?.photoURL || user.photoURL || ""} className="w-full h-full object-cover" alt="User" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#4A5759] dark:text-[#E2E8F0]">
                              <UserIcon size={14} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </header>

                  {/* Messages Container */}
                  <div className="flex-1 overflow-y-auto chat-container pr-2 pb-32">
                    <div className="max-w-2xl mx-auto w-full space-y-8">
                      <AnimatePresence initial={false}>
                        {messages.map((msg) => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={msg.isBurning ? { 
                              opacity: 0, 
                              scale: 0.1, 
                              rotate: 15,
                              y: -100,
                              filter: "blur(4px)" 
                            } : { opacity: 1, y: 0 }}
                            transition={msg.isBurning ? { duration: 1.5 } : { duration: 0.3 }}
                            className={`flex items-start gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                          >
                            <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center border-2 border-white dark:border-white/20 shadow-sm font-bold text-white relative transition-colors dark:shadow-[0_0_15px_rgba(255,255,255,0.2)]
                              ${msg.role === "user" ? "bg-sand-medium overflow-hidden" : "bg-white dark:bg-[#1E293B] overflow-hidden"}`}>
                              {msg.role === "user" ? (
                                profileData?.photoURL || user?.photoURL ? (
                                  <img src={profileData?.photoURL || user?.photoURL || ""} className="w-full h-full object-cover" alt="Me" />
                                ) : "U"
                              ) : (
                                <div className="relative w-full h-full flex items-center justify-center">
                                  <Smile size={24} className={`${isDarkMode ? "text-indigo-400 fill-indigo-900/20" : "text-yellow-400 fill-yellow-50"}`} />
                                  <div className="absolute top-[55%] left-[20%] w-1.5 h-1 bg-pink-200 dark:bg-pink-900/40 rounded-full blur-[0.5px]" />
                                  <div className="absolute top-[55%] right-[20%] w-1.5 h-1 bg-pink-200 dark:bg-pink-900/40 rounded-full blur-[0.5px]" />
                                </div>
                              )}
                            </div>
                            <div className={`space-y-4 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                              <div className={`p-5 rounded-3xl shadow-sm border border-[#F0EFEB] dark:border-white/10 transition-all duration-500
                                ${msg.role === "user" 
                                  ? "bg-white dark:bg-[#1E293B] dark:text-[#F8FAFC] rounded-tr-none text-right dark:shadow-[0_0_20px_rgba(255,255,255,0.05)] dark:hover:shadow-[0_0_25px_rgba(255,255,255,0.1)]" 
                                  : "bg-white dark:bg-[#1E293B] dark:text-[#F8FAFC] rounded-tl-none text-left dark:shadow-[0_0_20px_rgba(165,180,252,0.08)] dark:hover:shadow-[0_0_25px_rgba(165,180,252,0.12)]"}`}>
                                <p className="text-base md:text-lg leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                {msg.moodSummary && (
                                  <div className="mt-4 p-4 bg-friend-light/30 dark:bg-indigo-400/10 rounded-2xl border border-friend-bg/20 dark:border-indigo-400/20 space-y-3 animate-fade-in shadow-inner">
                                    <div className="flex items-center gap-2">
                                      <div className="px-3 py-1 bg-white dark:bg-[#0F172A] rounded-full text-[10px] font-bold uppercase tracking-wider text-friend-bg dark:text-indigo-400 border border-friend-bg/10 dark:border-indigo-400/10 shadow-sm transition-colors">
                                        {msg.moodSummary.dominant_emotion}
                                      </div>
                                    </div>
                                    <p className="text-sm font-medium italic text-[#4A5759] dark:text-[#E2E8F0]">"{msg.moodSummary.highlight}"</p>
                                    <div className="pt-2 border-t border-friend-bg/10 dark:border-indigo-400/10 flex items-center gap-2 text-[11px] text-muted dark:text-[#94A3B8] font-medium">
                                      <Sparkles size={12} className="text-coral-warm" />
                                      {msg.moodSummary.gentle_reminder}
                                    </div>
                                  </div>
                                )}
                                {msg.stickerUrl && (
                                  <div className="mt-4 animate-fade-in">
                                    <img 
                                      src={msg.stickerUrl} 
                                      alt="Sticker Emosi" 
                                      className="w-48 h-48 rounded-2xl mx-auto shadow-inner bg-subtle-bg dark:bg-black/20 p-2 transition-colors"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {isLoading && (
                        <motion.div 
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-4"
                        >
                          <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1E293B] flex items-center justify-center border-2 border-white dark:border-[#1E293B] shadow-sm font-bold opacity-80 overflow-hidden relative transition-colors">
                            <div className="relative w-full h-full flex items-center justify-center scale-90">
                              <Smile size={24} className={`${isDarkMode ? "text-indigo-400 fill-indigo-900/20" : "text-yellow-400 fill-yellow-50"}`} />
                              <div className="absolute top-[55%] left-[20%] w-1.5 h-1 bg-pink-200 dark:bg-pink-900/40 rounded-full blur-[0.5px]" />
                              <div className="absolute top-[55%] right-[20%] w-1.5 h-1 bg-pink-200 dark:bg-pink-900/40 rounded-full blur-[0.5px]" />
                            </div>
                          </div>
                          <div className="bg-white dark:bg-[#1E293B] p-5 rounded-3xl rounded-tl-none shadow-sm border border-[#F0EFEB] dark:border-white/5 transition-colors">
                             <p className="text-muted dark:text-[#94A3B8] italic flex items-center gap-2">
                              <History size={16} className="animate-spin" />
                              Bentar ya...
                             </p>
                          </div>
                        </motion.div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </div>

                  {/* Input & Call to Actions */}
                  <div className="sticky bottom-0 left-0 right-0 py-6 px-4 md:px-0 flex flex-col items-center gap-4 bg-transparent mt-auto z-30">
                    <div className="flex flex-wrap gap-2 justify-center min-h-[40px]">
                      {isBurningMode && (
                        <button 
                          onClick={burnMessages}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-coral-warm text-white hover:bg-red-600 transition-colors font-medium text-xs shadow-md animate-fade-in"
                        >
                          <Flame size={16} /> Bakar Perasaan Ini!
                        </button>
                      )}
                    </div>

                    <div className="w-full max-w-2xl bg-white dark:bg-[#1E293B] rounded-[2rem] md:rounded-full px-5 py-3 md:px-8 md:py-4 flex items-center shadow-2xl border border-border-subtle dark:border-white/10 focus-within:ring-2 focus-within:ring-friend-bg transition-all dark:shadow-[0_0_40px_rgba(255,255,255,0.05)]">
                      <input 
                        type="text" 
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder={isBurningMode ? "Tumpahin semua kekesalan lo di sini..." : "Tulis apa aja, gw dengerin..."}
                        className="flex-1 bg-transparent border-none outline-none text-[#4A5759] dark:text-[#E2E8F0] placeholder-[#B8B8B2] dark:placeholder-[#64748B] text-sm md:text-base"
                      />
                      <button 
                        onClick={() => handleSend()}
                        disabled={isLoading || !inputValue.trim()}
                        className={`ml-2 md:ml-4 p-2 md:p-0 text-friend-bg dark:text-indigo-400 font-bold text-xs md:text-sm tracking-widest uppercase flex items-center gap-2 hover:scale-105 transition-transform ${isLoading ? "opacity-30" : ""}`}
                      >
                        <span className="hidden md:inline">Kirim</span> <Send size={18} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSafeSpace && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/95 dark:bg-[#060B18]/97 backdrop-blur-2xl z-[70] flex items-center justify-center p-4 md:p-8 overflow-y-auto"
          >
            <div className="max-w-4xl w-full h-full md:h-auto space-y-12 py-12">
              <button 
                onClick={() => setShowSafeSpace(false)}
                className="absolute top-8 right-8 p-3 rounded-full bg-white/50 dark:bg-slate-900/40 border border-border-subtle dark:border-white/10 text-muted dark:text-[#E2E8F0] hover:text-coral-warm transition-all"
              >
                <X size={24} />
              </button>

              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-friend-bg/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Shield size={40} className="text-friend-bg" />
                </div>
                <h2 className="text-4xl font-serif italic text-[#4A5759] dark:text-[#F8FAFC]">Safe Space lo di Sini</h2>
                <p className="text-muted dark:text-[#94A3B8] max-w-lg mx-auto">
                  Gue nggak cuma mau lo dengerin saran, tapi gue mau lo ngerasa aman sekarang juga. Coba cara-cara ini buat ngelepasin rasa sakit tanpa nyakitin diri lo sendiri.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Physical Safe Actions */}
                <div className="p-8 bg-white dark:bg-[#1E293B]/50 rounded-[2.5rem] border border-border-subtle dark:border-white/10 space-y-6 dark:shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                  <div className="flex items-center gap-3 text-friend-bg dark:text-indigo-400">
                    <Activity size={20} className="dark:drop-shadow-[0_0_5px_rgba(129,140,248,0.5)]" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">Tindakan Aman</h3>
                  </div>
                  <ul className="space-y-4">
                    {[
                      { icon: "🧊", text: "Genggam es batu sekuat mungkin sampe tangan lo ngerasa dingin banget." },
                      { icon: "🎨", text: "Coret-coret kertas sesuka hati, tekan pulpennya sekuat tenaga." },
                      { icon: "🥨", text: "Makan sesuatu yang rasanya tajam banget (asam/pedas)." },
                      { icon: "🚿", text: "Mandi air dingin atau cuci muka pake air es." },
                      { icon: "👊", text: "Pukul bantal atau teriak sekeras mungkin di bantal." }
                    ].map((item, i) => (
                      <li key={i} className="flex gap-4 items-start text-sm text-[#4A5759] dark:text-[#E2E8F0]">
                        <span className="text-lg">{item.icon}</span>
                        <p className="font-medium">{item.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Positive Affirmations Carousel (Simplified for now) */}
                <div className="p-8 bg-friend-bg text-white rounded-[2.5rem] shadow-xl space-y-6">
                  <div className="flex items-center gap-3 opacity-80">
                    <Quote size={20} />
                    <h3 className="text-sm font-bold uppercase tracking-widest">Afirmasi Untuk Lo</h3>
                  </div>
                  <div className="space-y-8">
                    <motion.div 
                      key="affirmation"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-xl font-serif italic leading-relaxed"
                    >
                      "Rasa sakit ini valid, tapi dia nggak akan selamanya di sini. Lo jauh lebih kuat dari apa yang lo pikirin sekarang."
                    </motion.div>
                    <div className="flex gap-2">
                       <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">Lo berharga • Lo nggak sendirian • Satu napas lagi</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/20">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-80">Ingat:</p>
                    <p className="text-sm mt-1">Nyakitin diri sendiri itu cara otak lo minta tolong. Gue denger lo, dan gue ada di sini.</p>
                  </div>
                </div>

                {/* Help Resources */}
                <div className="p-8 bg-white dark:bg-[#1E293B]/50 rounded-[2.5rem] border border-border-subtle dark:border-white/10 space-y-6 dark:shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                  <div className="flex items-center gap-3 text-coral-warm dark:text-coral-warm">
                    <AlertCircle size={20} className="dark:drop-shadow-[0_0_5px_rgba(255,111,97,0.5)]" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">Bantuan Lanjut</h3>
                  </div>
                  <div className="space-y-4">
                    <a href="tel:119" className="block p-4 rounded-2xl bg-coral-warm/5 border border-coral-warm/20 hover:bg-coral-warm/10 transition-all">
                      <p className="text-[10px] font-bold text-coral-warm uppercase tracking-widest">Darurat (Kemenkes)</p>
                      <p className="text-lg font-bold text-coral-warm mt-1">119 ext 8</p>
                    </a>
                    <a href="https://pijarpsikologi.org/" target="_blank" rel="noopener noreferrer" className="block p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 transition-all">
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Konseling Online</p>
                      <p className="text-sm font-bold text-blue-500 mt-1">Pijar Psikologi</p>
                    </a>
                    <div className="p-4 rounded-2xl bg-sand-medium/5 border border-sand-medium/20">
                      <p className="text-[10px] font-bold text-sand-medium uppercase tracking-widest">Tindakan Cepat</p>
                      <button 
                        onClick={() => { setShowSafeSpace(false); setShowGrounding(true); }}
                        className="text-sm font-bold text-sand-medium mt-1 underline hover:no-underline"
                      >
                        Mulai Latihan Napas
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-8">
                <button 
                  onClick={() => setShowSafeSpace(false)}
                  className="px-12 py-5 bg-friend-bg text-white rounded-full font-bold tracking-[0.2em] uppercase shadow-2xl hover:scale-105 transition-all flex items-center gap-3"
                >
                  Gue udah ngerasa lebih aman <Check size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grounding Overlay */}
      <AnimatePresence>
        {showGrounding && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-md z-[60] flex items-center justify-center p-6 transition-colors"
          >
            <button 
              onClick={() => setShowGrounding(false)}
              className="absolute top-8 right-8 text-muted dark:text-[#94A3B8] hover:text-text-primary dark:hover:text-white transition-colors"
            >
              <X size={32} />
            </button>
            <div className="max-w-md w-full text-center space-y-8">
              <div className="w-24 h-24 bg-friend-light dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <Wind size={48} className="text-friend-bg dark:text-indigo-400" />
              </div>
              <h2 className="text-3xl font-serif italic text-[#4A5759] dark:text-white dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">Napas bareng gw...</h2>
              <div className="p-8 bg-subtle-bg dark:bg-slate-900/40 rounded-[2rem] border border-[#F2F0EB] dark:border-white/10 transition-colors dark:shadow-[0_0_25px_rgba(255,255,255,0.05)]">
                <p className="text-xl leading-relaxed text-[#4A5759] dark:text-[#E2E8F0]">
                  Tarik napas pelan-pelan lewat hidung... Tahan... Buang lewat mulut. 
                </p>
                <p className="mt-4 text-sm text-muted dark:text-[#94A3B8]">
                  Gue di sini nemenin lo. Fokus ke napas lo aja dulu ya.
                </p>
              </div>
              <button 
                onClick={() => setShowGrounding(false)}
                className="px-8 py-4 bg-friend-bg dark:bg-indigo-600 text-white rounded-full font-bold tracking-widest uppercase shadow-lg hover:shadow-xl hover:scale-105 transition-all"
              >
                Gw udah mendingan
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
