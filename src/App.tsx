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
  Zap,
  Paperclip,
  Image as ImageIcon,
  Loader2
} from "lucide-react";
import { chatWithFriend, generateSticker, ChatMessage, checkIsStickerQuotaExhausted } from "./services/gemini";
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType, updateProfileData, getAccessToken, setCachedAccessToken } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from "firebase/firestore";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
  stickerUrl?: string;
  stickerLoading?: boolean;
  moodSummary?: {
    dominant_emotion: string;
    highlight: string;
    gentle_reminder: string;
  };
  isBurning?: boolean;
  mediaUrl?: string;
  mediaType?: string;
  mediaName?: string;
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
            {profileData?.photoURL || user?.photoURL ? (
              <img src={profileData?.photoURL || user?.photoURL || ""} className="w-full h-full object-cover" alt="Profile" />
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
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  // Sinkronisasi class dark di document root (html) dan localStorage saat state berubah
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  // Sinkronisasi otomatis dengan perubahan mode malam / sistem OS
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem("theme");
      if (!saved) {
        setIsDarkMode(e.matches);
      }
    };
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }
    
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);
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
  
  // Media Upload & Moderation States
  const [attachedMedia, setAttachedMedia] = useState<{ url: string; type: string; name: string } | null>(null);
  const [isScanningMedia, setIsScanningMedia] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive Media Browser states
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const [showDriveConsent, setShowDriveConsent] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [driveSearchQuery, setDriveSearchQuery] = useState("");
  const [driveError, setDriveError] = useState("");

  // Auth Listener
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      if (currUser) {
        setIsLanding(false);
        // Initial profile fetch
        const userDocRef = doc(db, 'users', currUser.uid);
        try {
          const userDocSnapshot = await getDoc(userDocRef);
          if (userDocSnapshot.exists()) {
            setProfileData(userDocSnapshot.data());
          }
        } catch (err: any) {
          if (err.message?.includes('offline') || err.code === 'unavailable') {
            console.warn("Profil awal gagal dimuat karena offline, menggunakan cache lokal jika tersedia.");
          } else {
            console.warn("Gagal memuat profil awal:", err.message || err);
          }
        }

        // Setup real-time listener for profile with handling cleanup and error callback
        unsubProfile = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            setProfileData(doc.data());
          }
        }, (error) => {
          console.warn("Profile Listener stopped or failed:", error);
        });
      } else {
        setProfileData(null);
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
      }
    });
    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
    };
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

  const createEmojiSticker = (emoji: string, label: string): string => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);
      
      const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
      let bgStart = "#FFF5F5";
      let bgEnd = "#FED7D7";
      const l = label.toLowerCase();
      
      if (l === "happy" || emoji === "😊" || emoji === "✨" || emoji === "⭐") { 
        bgStart = "#FFFDF0"; bgEnd = "#FEF08A"; 
      } else if (l === "sad" || emoji === "🥺" || emoji === "☁️" || emoji === "🐧") { 
        bgStart = "#EFF6FF"; bgEnd = "#BFDBFE"; 
      } else if (l === "angry" || emoji === "😤") { 
        bgStart = "#FEF2F2"; bgEnd = "#FCA5A5"; 
      } else if (l === "tired" || emoji === "😴" || emoji === "🦥") { 
        bgStart = "#F5F3FF"; bgEnd = "#DDD6FE"; 
      } else if (l === "anxious" || emoji === "😰") { 
        bgStart = "#F0FDF4"; bgEnd = "#BBF7D0"; 
      } else if (emoji === "🐱" || emoji === "🐈" || emoji === "🦁") { 
        bgStart = "#FFFAF0"; bgEnd = "#FFE4E6"; // cozy pinkish peach for cats
      } else if (emoji === "🐻" || emoji === "🦊" || emoji === "🐿️" || emoji === "🐹") {
        bgStart = "#FFF7ED"; bgEnd = "#FED7AA"; // happy orange pastel
      } else if (emoji === "🐶") { 
        bgStart = "#FAF5FF"; bgEnd = "#E9D5FF"; // loving purple 
      } else if (emoji === "🐼") { 
        bgStart = "#F9FAFB"; bgEnd = "#E5E7EB"; // minimalist premium grey-white 
      } else if (emoji === "☕") { 
        bgStart = "#FFFBEB"; bgEnd = "#FED7AA"; // warm coffee brown tone
      } else if (emoji === "🐰") {
        bgStart = "#FFF1F2"; bgEnd = "#FECDD3"; // sweet pastel pink
      } else if (l === "encouragement") { 
        bgStart = "#FFFBEB"; bgEnd = "#FDE68A"; 
      }

      gradient.addColorStop(0, bgStart);
      gradient.addColorStop(1, bgEnd);

      ctx.beginPath();
      ctx.arc(128, 128, 100, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.lineWidth = 12;
      ctx.strokeStyle = "#FFFFFF";
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
      ctx.stroke();

      ctx.font = "84px Apple Color Emoji, Segoe UI Emoji, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 128, 128);
    }
    return canvas.toDataURL("image/png");
  };

  const guessEmojiFromPrompt = (prompt: string): string => {
    const p = prompt.toLowerCase();
    
    // 1. Specific animal/object checks for high accuracy match
    if (p.includes("cat") || p.includes("kucing") || p.includes("kitten") || p.includes("meow")) return "🐱";
    if (p.includes("dog") || p.includes("anjing") || p.includes("puppy") || p.includes("guk")) return "🐶";
    if (p.includes("panda")) return "🐼";
    if (p.includes("bear") || p.includes("beruang")) return "🐻";
    if (p.includes("sloth")) return "🦥";
    if (p.includes("bunny") || p.includes("rabbit") || p.includes("kelinci")) return "🐰";
    if (p.includes("penguin")) return "🐧";
    if (p.includes("koala")) return "🐨";
    if (p.includes("fox") || p.includes("rubah")) return "🦊";
    if (p.includes("hamster")) return "🐹";
    if (p.includes("squirrel") || p.includes("tupai")) return "🐿️";
    if (p.includes("duck") || p.includes("bebek")) return "🦆";
    if (p.includes("coffee") || p.includes("tea") || p.includes("teh") || p.includes("kopi") || p.includes("cangkir") || p.includes("cup") || p.includes("mug")) return "☕";
    if (p.includes("balloon") || p.includes("balon")) return "🎈";
    if (p.includes("ghost") || p.includes("hantu")) return "👻";
    
    // 2. Fallback to emotions
    if (p.includes("happy") || p.includes("joy") || p.includes("smile") || p.includes("laugh") || p.includes("senang") || p.includes("gembira")) return "😊";
    if (p.includes("sad") || p.includes("cry") || p.includes("tears") || p.includes("cloud") || p.includes("sedih") || p.includes("nangis")) return "🥺";
    if (p.includes("angry") || p.includes("mad") || p.includes("grumpy") || p.includes("rage") || p.includes("marah") || p.includes("kesal")) return "😤";
    if (p.includes("tired") || p.includes("sleep") || p.includes("exhaust") || p.includes("lelah") || p.includes("cape") || p.includes("tidur")) return "😴";
    if (p.includes("anxious") || p.includes("worry") || p.includes("nervous") || p.includes("fear") || p.includes("cemas") || p.includes("khawatir") || p.includes("panik")) return "😰";
    if (p.includes("heart") || p.includes("love") || p.includes("hug") || p.includes("cinta") || p.includes("peluk")) return "💖";
    if (p.includes("star") || p.includes("sparkle") || p.includes("magic") || p.includes("bintang")) return "✨";
    if (p.includes("win") || p.includes("success") || p.includes("celebrate") || p.includes("trophy") || p.includes("menang") || p.includes("berhasil")) return "🏆";
    if (p.includes("clap") || p.includes("congrat") || p.includes("selamat")) return "👏";
    return "👍";
  };

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
      // 1. Generate an initial beautiful emoji sticker instantly (client-side)
      const instantStickerUrl = createEmojiSticker(mood.emoji, mood.label);
      
      const modelMsgId = (Date.now() + 1).toString();
      const modelMsg: Message = {
        id: modelMsgId,
        role: "model",
        text: `Gw catet ya, hari ini lo lagi ngerasa ${mood.label.toLowerCase()}. Nih, stiker lucu buat lo biar nemenin hari lo!`,
        timestamp: new Date(),
        stickerUrl: instantStickerUrl, // Render instantly!
        stickerLoading: false
      };
      
      // 2. Immediately append the chat reply
      setMessages(prev => [...prev, modelMsg]);
      
      // 3. Fallback for non-logged in users (so they see the entry instantly in Jurnal)
      if (!user) {
        const newMood: MoodEntry = {
          id: Date.now().toString(),
          mood: mood.label,
          stickerUrl: instantStickerUrl,
          timestamp: new Date()
        };
        setMoodHistory(prev => [newMood, ...prev].slice(0, 5));
      }
      
      // 4. Release the screen blocker immediately!
      setIsGeneratingMood(false);

      // 5. Spawn non-blocking background task to handle Firestore saving and premium sticker generation
      (async () => {
        let docRef: any = null;
        if (user) {
          const path = `users/${user.uid}/mood_history`;
          try {
            docRef = await addDoc(collection(db, path), {
              userId: user.uid,
              mood: mood.label,
              stickerUrl: instantStickerUrl,
              timestamp: serverTimestamp()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, path);
          }
        }

        try {
          const rawUrl = await generateSticker(mood.prompt);
          const finalStickerUrl = await compressSticker(rawUrl);

          // Update Firestore entry with the high-quality sticker if it was created
          if (docRef) {
            try {
              await updateDoc(docRef, { stickerUrl: finalStickerUrl });
            } catch (err) {
              console.warn("Could not update mood history with premium sticker:", err);
            }
          }

          // Swap the instant sticker with the premium sticker seamlessly in the chat bubble
          setMessages(prev => prev.map(m => 
            m.id === modelMsgId ? { ...m, stickerUrl: finalStickerUrl } : m
          ));
        } catch (err) {
          console.warn("Sticker generation failed, keeping fallback:", err);
        }
      })();

    } catch (err) {
      console.error(err);
      setIsGeneratingMood(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
      setIsLanding(false);
    } catch (error: any) {
      const isAbortOrCancel = 
        error.code === 'auth/popup-closed-by-user' || 
        error.code === 'auth/cancelled-popup-request' ||
        error.name === 'AbortError' ||
        error.message?.includes('abort') ||
        error.message?.includes('auth/cancelled-popup-request') ||
        error.message?.includes('auth/popup-closed-by-user') ||
        error.message?.toLowerCase().includes('cancel') ||
        error.message?.toLowerCase().includes('close');

      if (isAbortOrCancel) {
        console.warn("Sign-in aborted or closed by user:", error?.message || error);
        return;
      }

      console.error("Login failed:", error);
      // Detailed error for common Firebase issues
      let friendlyMsg = error.message || "Pastikan domain ini sudah terdaftar di Authorized Domains Firebase Console.";
      if (error.code === 'auth/popup-blocked') {
        friendlyMsg = "Popup terblokir oleh browser. Coba aktifkan popup atau gunakan browser lain.";
      } else if (error.code === 'auth/unauthorized-domain') {
        friendlyMsg = `Domain ini (${window.location.hostname}) BELUM diizinkan untuk login di Firebase Console.`;
      } else if (error.code === 'auth/operation-not-allowed') {
        friendlyMsg = "Metode login Google belum diaktifkan di Firebase Console.";
      }
      alert(`Login Gagal (${error.code || 'error'}): ${friendlyMsg}\n\nCara Fix:\n1. Buka https://console.firebase.google.com/\n2. Pilih Project lo\n3. Ke 'Authentication' -> 'Settings' -> 'Authorized Domains'\n4. Tambahin: ${window.location.hostname}`);
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

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleMediaSelected = async (base64data: string, mimeType: string, fileName: string) => {
    setIsScanningMedia(true);
    try {
      let finalData = base64data;
      if (mimeType.startsWith("image/")) {
        finalData = await compressImage(base64data);
      }

      const response = await fetch("/api/moderate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mediaData: finalData,
          mimeType: mimeType
        })
      });

      if (!response.ok) {
        throw new Error(`Media scan failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("[Moderation Response]:", result);

      if (!result.safe) {
        alert(`⚠️ PEMBERITAHUAN KEAMANAN:\n\nMohon maaf, cerita/media lo ("${fileName}") diblokir oleh sistem karena terdeteksi berisi konten yang tidak pantas (berbau seksual atau kekerasan).\n\nMari kita jaga ruang cerita ini tetap aman dan nyaman buat kita semua ya!\n\nAlasan: ${result.reason || "Mata tajam AI menyaring konten berbahaya."}`);
        setIsScanningMedia(false);
        return;
      }

      setAttachedMedia({
        url: finalData,
        type: mimeType,
        name: fileName
      });
    } catch (err: any) {
      console.error("Moderation error:", err);
      alert("Duh, gagal memeriksa keamanan berkas ini. Coba berkas lainnya ya.");
    } finally {
      setIsScanningMedia(false);
    }
  };

  const handleLocalFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert("Ukuran berkas terlalu besar! Maksimal ukuran adalah 50MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Str = reader.result as string;
      await handleMediaSelected(base64Str, file.type, file.name);
    };
    reader.onerror = () => {
      alert("Gagal membaca berkas lokal.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const fetchDriveFiles = async (searchName?: string) => {
    setIsLoadingDriveFiles(true);
    setDriveError("");
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("Gagal memperoleh token akses Google.");
      }

      let q = "(mimeType contains 'image/' or mimeType contains 'video/') and trashed = false";
      if (searchName && searchName.trim()) {
        const sanitized = searchName.replace(/'/g, "\\'");
        q += ` and name contains '${sanitized}'`;
      }

      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,thumbnailLink,iconLink)&pageSize=30`;
      
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Google API returned ${res.status}: ${errText}`);
      }

      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (err: any) {
      console.error("Error listing Drive files:", err);
      setDriveError(err.message || "Gagal memuat daftar berkas Google Drive.");
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  const handleDriveFileSelected = async (fileId: string, mimeType: string, fileName: string) => {
    setShowDriveBrowser(false);
    setIsScanningMedia(true);
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("Otorisasi kedaluwarsa. Silakan coba lagi.");
      }

      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const fileResponse = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!fileResponse.ok) {
        throw new Error(`Gagal mengunduh file Drive: ${fileResponse.statusText}`);
      }

      const blob = await fileResponse.blob();
      
      if (blob.size > 50 * 1024 * 1024) {
        alert("Ukuran berkas terlalu besar! Maksimal ukuran adalah 50MB.");
        setIsScanningMedia(false);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Str = reader.result as string;
        await handleMediaSelected(base64Str, mimeType, fileName);
      };
      reader.onerror = () => {
        alert("Gagal membaca berkas Drive.");
        setIsScanningMedia(false);
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      console.error("Gagal mengunduh berkas Google Drive:", err);
      alert(`Kesalahan Google Drive (403 atau Izin): ${err.message || "Pastikan berkas berada di Drive lo dan lo login pake akun yang sesuai."}`);
      setIsScanningMedia(false);
    }
  };

  const openGooglePicker = async () => {
    setIsScanningMedia(true);
    try {
      let token = getAccessToken();
      if (!token) {
        await signInWithGoogle();
        token = getAccessToken();
        if (!token) {
          throw new Error("Gagal memperoleh token akses Google dari Firebase.");
        }
      }

      setShowDriveBrowser(true);
      await fetchDriveFiles();
    } catch (err: any) {
      console.warn("Informasi Login / Inisialisasi Drive:", err);
      setIsScanningMedia(false);
      
      const isAbortOrCancel = 
        err.code === 'auth/popup-closed-by-user' || 
        err.code === 'auth/cancelled-popup-request' ||
        err.name === 'AbortError' ||
        err.message?.includes('abort') ||
        err.message?.toLowerCase().includes('cancel') ||
        err.message?.toLowerCase().includes('close');

      if (isAbortOrCancel) {
        return;
      }

      if (err.message?.includes('offline') || err.code === 'unavailable') {
        alert("Gagal memuat Drive karena koneksi internet sedang offline/putus.");
        return;
      }

      alert(`Gagal otentikasi Google: ${err.message || err}`);
    } finally {
      setIsScanningMedia(false);
    }
  };

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || inputValue;
    if ((!textToSend.trim() && !attachedMedia) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: textToSend,
      timestamp: new Date(),
      mediaUrl: attachedMedia?.url,
      mediaType: attachedMedia?.type,
      mediaName: attachedMedia?.name
    };

    const mediaPayload = attachedMedia ? { data: attachedMedia.url, mimeType: attachedMedia.type } : undefined;

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setAttachedMedia(null);
    setIsLoading(true);

    try {
      // Limit history to last 14 messages (7 turns) to optimize request size & speed
      const limitedHistory = history.slice(-14);
      const responseText = await chatWithFriend(limitedHistory, textToSend, mediaPayload);
      
      const stickerMatch = responseText.match(/\[GENERATE_STICKER: (.*?)\]/);
      const groundingMatch = responseText.match(/\[TRIGGER_GROUNDING\]/);
      const safeSpaceMatch = responseText.match(/\[TRIGGER_SAFE_SPACE\]/);
      const moodSummaryMatch = responseText.match(/\[MOOD_SUMMARY: (.*?)\]/s);
      
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

      let initialStickerUrl = undefined;
      let shouldLoadSticker = !!stickerMatch;

      if (stickerMatch && checkIsStickerQuotaExhausted()) {
        const emoji = guessEmojiFromPrompt(stickerMatch[1]);
        initialStickerUrl = createEmojiSticker(emoji, "encouragement");
        shouldLoadSticker = false;
      }

      const modelMessageId = (Date.now() + 1).toString();
      const modelMessage: Message = {
        id: modelMessageId,
        role: "model",
        text: cleanText,
        timestamp: new Date(),
        stickerUrl: initialStickerUrl,
        moodSummary,
        stickerLoading: shouldLoadSticker
      };

      // Save chat session/summary to Firestore if logged in (in background)
      if (user && !customMessage) { // Don't save internal/action-triggered messages as separate stories usually
        const path = `users/${user.uid}/chat_sessions`;
        addDoc(collection(db, path), {
          userId: user.uid,
          preview: textToSend.length > 50 ? textToSend.substring(0, 50) + "..." : textToSend,
          mood: moodSummary?.dominant_emotion || null,
          timestamp: serverTimestamp()
        }).catch (error => {
          handleFirestoreError(error, OperationType.CREATE, path);
        });
      }

      // Add the text message immediately to keep the chat highly responsive
      setMessages(prev => [...prev, modelMessage]);
      setHistory(prev => [
        ...prev,
        { role: "user", parts: [{ text: textToSend + (mediaPayload ? " [Media/Gambar terlampir]" : "") }] },
        { role: "model", parts: [{ text: responseText }] }
      ]);
      
      // Stop overall chat loading state now
      setIsLoading(false);

      // Generate sticker in the background if requested by model
      if (stickerMatch && !checkIsStickerQuotaExhausted()) {
        (async () => {
          let stickerUrl = undefined;
          try {
            const rawUrl = await generateSticker(stickerMatch[1]);
            stickerUrl = await compressSticker(rawUrl);
          } catch (err) {
            console.warn("Sticker generation in chat failed, using fallback:", err);
            const emoji = guessEmojiFromPrompt(stickerMatch[1]);
            stickerUrl = createEmojiSticker(emoji, "encouragement");
          }

          // Swap loading spinner with generated sticker url
          setMessages(prev => prev.map(m => 
            m.id === modelMessageId ? { ...m, stickerUrl, stickerLoading: false } : m
          ));
        })();
      }

    } catch (error: any) {
      console.error(error);
      const errorMessageStr = error?.message || "Coba lagi deh.";
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: `Duh, sori banget, gw lagi agak nge-blank nih. Sinyalnya kali ya? (Error: ${errorMessageStr})`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
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
    <div className={`flex flex-col h-[100dvh] w-full overflow-hidden transition-colors duration-500 bg-bg-primary dark:bg-slate-950 ${isDarkMode ? "dark" : ""}`}>
      <BackgroundEffect isDarkMode={isDarkMode} />
      
      <AnimatePresence initial={false}>
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
                {isDarkMode ? <Sun className="w-5 h-5 md:w-6 md:h-6" /> : <Moon className="w-5 h-5 md:w-6 md:h-6" />}
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
                  <Smile className="w-16 h-16 md:w-20 md:h-20 text-yellow-400 fill-yellow-50 dark:text-white dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" strokeWidth={1.5} />
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
                <Smile className="w-4 h-4 md:w-5 md:h-5 text-[#4A5759] dark:text-[#E2E8F0]" />
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
            <main className="flex-1 flex flex-col relative max-w-4xl mx-auto w-full px-4 md:px-12 h-full overflow-hidden bg-transparent">
              {isEditingProfile ? (
                <EditProfileView />
              ) : (
                <>
                  {/* Sticky Top Navbar */}
                  <header className="sticky top-4 flex-shrink-0 z-20 mt-4 px-6 py-3 bg-white/75 dark:bg-[#0F172A]/70 backdrop-blur-xl border border-border-subtle/50 dark:border-white/10 rounded-2xl md:rounded-full flex items-center justify-between transition-all duration-300 shadow-md">
                    <div className="flex items-center gap-2 md:gap-4">
                      <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="md:hidden p-2 -ml-2 text-[#4A5759] dark:text-[#E2E8F0] hover:bg-subtle-bg dark:hover:bg-white/5 rounded-full transition-colors"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      <h1 className="px-2 md:px-4 py-1 rounded-2xl text-lg md:text-2xl font-serif italic text-[#4A5759] dark:text-white dark:drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">Friend</h1>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:block text-[10px] font-bold text-muted dark:text-[#64748B] uppercase tracking-widest">
                        Wellness Companion
                      </div>
                      <div className="bg-[#EDEDE9] dark:bg-[#1E293B]/60 px-3 py-1.5 rounded-full text-xs font-medium text-[#4A5759] dark:text-[#E2E8F0] transition-colors border border-border-subtle dark:border-white/5">
                        Hai, <span className="font-bold text-friend-bg dark:text-indigo-400">{profileData?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || "Teman"}</span>! ✨
                      </div>
                      {user && (
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 ml-2 shadow-sm bg-subtle-bg dark:bg-slate-900/60">
                          {profileData?.photoURL || user?.photoURL ? (
                            <img src={profileData?.photoURL || user?.photoURL || ""} className="w-full h-full object-cover" alt="User" />
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
                  <div className="flex-1 overflow-y-auto chat-container py-4 px-1 md:px-2 scroll-smooth">
                    <div className="max-w-2xl mx-auto w-full space-y-8 pb-10">
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
                                {msg.mediaUrl && (
                                  <div className="mt-3 mb-2 rounded-2xl overflow-hidden max-w-sm bg-neutral-100 dark:bg-black/30 p-1 border border-neutral-200 dark:border-white/5 transition-colors">
                                    {msg.mediaType?.startsWith("image/") ? (
                                      <img 
                                        src={msg.mediaUrl} 
                                        alt={msg.mediaName || "Media cerita"} 
                                        className="max-h-60 w-full object-cover rounded-xl"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : msg.mediaType?.startsWith("video/") ? (
                                      <video 
                                        src={msg.mediaUrl} 
                                        controls 
                                        className="max-h-60 w-full object-cover rounded-xl"
                                      />
                                    ) : (
                                      <div className="p-3 flex items-center gap-3">
                                        <Shield className="w-8 h-8 text-indigo-400" />
                                        <div className="text-left">
                                          <p className="text-xs font-bold truncate max-w-[150px] text-zinc-700 dark:text-zinc-300">{msg.mediaName || "Attachment"}</p>
                                          <a 
                                            href={msg.mediaUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 font-semibold underline flex items-center gap-1"
                                          >
                                            Lihat Media
                                          </a>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
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
                                {msg.stickerLoading && (
                                  <div className="mt-4 w-48 h-48 rounded-2xl mx-auto bg-subtle-bg/60 dark:bg-slate-900/40 border border-dashed border-border-subtle dark:border-indigo-500/20 flex flex-col items-center justify-center p-4 text-center animate-pulse gap-2 transition-colors">
                                    <Loader2 className="w-8 h-8 animate-spin text-friend-bg dark:text-indigo-400" />
                                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted dark:text-[#64748B]">Bikin stiker lucu dulu...</p>
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
                  <div className="flex-shrink-0 py-3 md:py-6 px-4 md:px-0 flex flex-col items-center gap-3 md:gap-4 bg-transparent z-10">
                    <div className="flex flex-wrap gap-2 justify-center min-h-[32px] md:min-h-[40px]">
                      {isBurningMode && (
                        <button 
                          onClick={burnMessages}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-coral-warm text-white hover:bg-red-600 transition-colors font-medium text-xs shadow-md animate-fade-in"
                        >
                          <Flame size={16} /> Bakar Perasaan Ini!
                        </button>
                      )}
                    </div>

                    {/* Attached Media Preview Tray */}
                    {attachedMedia && (
                      <div className="w-full max-w-2xl px-4 py-2 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between bg-zinc-50 dark:bg-[#0F172A] rounded-t-2xl animate-fade-in border-x border-t">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
                            {attachedMedia.type.startsWith("image/") ? (
                              <img src={attachedMedia.url} className="w-full h-full object-cover" alt="Attached" />
                            ) : (
                              <Shield className="w-5 h-5 text-indigo-400" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">{attachedMedia.name}</p>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Siap dikirim dengan cerita lo</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setAttachedMedia(null)}
                          className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors text-zinc-500"
                          title="Batalkan Terlampir"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    {/* Attachment Loading State Spacer */}
                    {isScanningMedia && (
                      <div className="w-full max-w-2xl px-4 py-3 bg-[#EEF2FF] dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium flex items-center gap-2 animate-pulse rounded-t-2xl border-x border-t border-indigo-100 dark:border-indigo-900/10">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Friend sedang melipatgandakan mata AI untuk menyaring keamanan media cerita lo...</span>
                      </div>
                    )}

                    <div className={`w-full max-w-2xl bg-white dark:bg-[#1E293B] px-4 py-2 md:px-8 md:py-4 flex items-center shadow-xl md:shadow-2xl border border-border-subtle dark:border-white/10 focus-within:ring-2 focus-within:ring-friend-bg transition-all dark:shadow-[0_0_40px_rgba(255,255,255,0.05)] mb-2 md:mb-0
                      ${(attachedMedia || isScanningMedia) ? "rounded-b-2xl md:rounded-b-[2rem] border-t-0" : "rounded-2xl md:rounded-full"}`}>
                      
                      {/* Hidden file input */}
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleLocalFileSelected} 
                        accept="image/*,video/*" 
                        className="hidden" 
                      />

                      {/* Attachment Button & Menu */}
                      <div className="relative mr-2 md:mr-4">
                        <button
                          onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                          disabled={isLoading || isScanningMedia}
                          type="button"
                          className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors flex items-center justify-center text-zinc-500 hover:text-friend-bg dark:hover:text-indigo-400"
                          title="Tambah Media Cerita"
                        >
                          <Paperclip size={18} className={showAttachmentMenu ? "rotate-45 text-friend-bg dark:text-indigo-400 transition-transform" : "transition-transform"} />
                        </button>

                        {showAttachmentMenu && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowAttachmentMenu(false)} />
                            <div className="absolute bottom-12 left-0 mt-2 w-56 rounded-2xl bg-white dark:bg-[#1E293B] shadow-2xl border border-neutral-100 dark:border-white/10 py-2 z-40 animate-fade-in text-left">
                              <button
                                onClick={() => {
                                  setShowAttachmentMenu(false);
                                  fileInputRef.current?.click();
                                }}
                                className="w-full px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-3"
                              >
                                <ImageIcon size={16} className="text-zinc-500" />
                                <span>Upload dari Galeri HP/PC</span>
                              </button>
                              <button
                                onClick={() => {
                                  setShowAttachmentMenu(false);
                                  setShowDriveConsent(true);
                                }}
                                className="w-full px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-3 border-t border-neutral-50 dark:border-white/5"
                              >
                                <svg className="w-4 h-4 text-zinc-500 fill-current" viewBox="0 0 24 24">
                                  <path d="M19.347 13.916l2.353-4.076H15.65c-.407 0-.776-.222-.962-.577l-4.704-8.085c-.2-.345-.558-.562-.958-.562s-.758.217-.958.562L3.364 9.263c-.184.354-.555.577-.962.577H.14c.148.093 2.16 3.743 2.353 4.076L7.221 22.1c.21.35.58.58 1.01.58h7.02c.4 0 .8-.23 1-.58l4.096-8.184zm-5.741-2.261l-1.606 2.78c-.2.34-.56.57-.96.57s-.76-.23-.96-.57l-1.62-2.78 1.62-2.78c.2-.34.56-.57.96-.57s.76.23.96.57l1.606 2.78z"/>
                                </svg>
                                <span>Pilih dari Google Drive</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <input 
                        type="text" 
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder={isBurningMode ? "Tumpahin kesal lo..." : "Tulis curhatan lo..."}
                        className="flex-1 bg-transparent border-none outline-none text-[#4A5759] dark:text-[#E2E8F0] placeholder-[#B8B8B2] dark:placeholder-[#64748B] text-sm md:text-base py-2 md:py-0"
                      />
                      <button 
                        onClick={() => handleSend()}
                        disabled={isLoading || isScanningMedia || (!inputValue.trim() && !attachedMedia)}
                        className={`ml-2 md:ml-4 p-2 md:p-0 text-friend-bg dark:text-indigo-400 font-bold text-xs md:text-sm tracking-widest uppercase flex items-center gap-2 hover:scale-105 transition-transform ${isLoading || isScanningMedia ? "opacity-30" : ""}`}
                      >
                        <span className="hidden md:inline">Kirim</span> <Send className="w-5 h-5 md:w-4 md:h-4" />
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

      {/* Custom Google Drive Media Browser Modal */}
      <AnimatePresence>
        {showDriveBrowser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-md z-[60] flex items-center justify-center p-4 md:p-6 transition-colors"
          >
            <div className="max-w-2xl w-full bg-white dark:bg-[#1E293B] rounded-[2rem] border border-[#F2F0EB] dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="p-6 border-b border-[#F2F0EB] dark:border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-serif italic text-[#4A5759] dark:text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-500 fill-current animate-pulse" viewBox="0 0 24 24">
                      <path d="M19.347 13.916l2.353-4.076H15.65c-.407 0-.776-.222-.962-.577l-4.704-8.085c-.2-.345-.558-.562-.958-.562s-.758.217-.958.562L3.364 9.263c-.184.354-.555.577-.962.577H.14c.148.093 2.16 3.743 2.353 4.076L7.221 22.1c.21.35.58.58 1.01.58h7.02c.4 0 .8-.23 1-.58l4.096-8.184zm-5.741-2.261l-1.606 2.78c-.2.34-.56.57-.96.57s-.76-.23-.96-.57l-1.62-2.78 1.62-2.78c.2-.34.56-.57.96-.57s.76.23.96.57l1.606 2.78z"/>
                    </svg>
                    Pilih Media dari Google Drive, nih!
                  </h3>
                  <p className="text-xs text-muted dark:text-[#94A3B8] mt-1">Gunakan gambar atau video dari akun Google Drive lo buat bercerita.</p>
                </div>
                <button 
                  onClick={() => setShowDriveBrowser(false)}
                  className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="px-6 py-4 bg-zinc-50 dark:bg-slate-900/40 border-b border-[#F2F0EB] dark:border-white/10 flex gap-2">
                <input
                  type="text"
                  placeholder="Cari nama berkas di Drive lo..."
                  value={driveSearchQuery}
                  onChange={(e) => setDriveSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      fetchDriveFiles(driveSearchQuery);
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-[#1E293B] rounded-xl text-sm text-[#4A5759] dark:text-[#E2E8F0] focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => fetchDriveFiles(driveSearchQuery)}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Cari
                </button>
              </div>

              {/* Dynamic Content */}
              <div className="flex-1 overflow-y-auto p-6 min-h-[40vh]">
                {isLoadingDriveFiles ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                    <p className="text-sm font-medium">Mengetuk pintu Google Drive...</p>
                  </div>
                ) : driveError ? (
                  <div className="text-center py-12">
                    <p className="text-red-500 dark:text-red-400 text-sm mb-4">⚠️ {driveError}</p>
                    <button
                      type="button"
                      onClick={() => fetchDriveFiles(driveSearchQuery)}
                      className="px-4 py-2 border border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl text-xs font-semibold"
                    >
                      Coba Lagi
                    </button>
                  </div>
                ) : driveFiles.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <p className="text-sm">Tidak menemukan file gambar atau video di Drive lo.</p>
                    <p className="text-xs text-zinc-400 mt-1">Pastikan ada berkas bertipe gambar (.jpg/.png/dll) atau video (.mp4/dll).</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {driveFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => handleDriveFileSelected(file.id, file.mimeType, file.name)}
                        className="group border border-[#E2E8F0] dark:border-white/10 hover:border-indigo-500 dark:hover:border-indigo-400 p-2 rounded-2xl bg-white dark:bg-[#1E293B] hover:shadow-lg transition-all cursor-pointer flex flex-col"
                      >
                        {/* Preview / Thumbnail */}
                        <div className="aspect-video w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center relative">
                          {file.thumbnailLink ? (
                            <img
                              src={file.thumbnailLink.replace(/=s\d+/, "=s240")}
                              alt={file.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="text-center flex flex-col items-center gap-1">
                              {file.mimeType.startsWith("image/") ? (
                                <ImageIcon className="w-8 h-8 text-neutral-400" />
                              ) : (
                                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </div>
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm p-1 rounded">
                            <img src={file.iconLink} className="w-3.5 h-3.5" alt="file-icon" />
                          </div>
                        </div>

                        {/* Title */}
                        <div className="mt-2 text-left">
                          <p className="text-xs font-semibold text-[#4A5759] dark:text-[#E2E8F0] truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[10px] text-muted dark:text-[#94A3B8] mt-0.5 truncate uppercase">
                            {file.mimeType.split("/")[1] || "berkas"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Google Drive Permission Consent Modal */}
      <AnimatePresence>
        {showDriveConsent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-md z-[70] flex items-center justify-center p-4 md:p-6 transition-colors"
          >
            <div className="max-w-md w-full bg-white dark:bg-[#1E293B] rounded-[2rem] border border-[#F2F0EB] dark:border-white/10 shadow-2xl overflow-hidden flex flex-col p-6 animate-fade-in text-left">
              <div className="flex flex-col items-center text-center space-y-4">
                {/* Visual Icon Header with Drive logo & lock */}
                <div className="relative">
                  <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/40 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-indigo-500 fill-current" viewBox="0 0 24 24">
                      <path d="M19.347 13.916l2.353-4.076H15.65c-.407 0-.776-.222-.962-.577l-4.704-8.085c-.2-.345-.558-.562-.958-.562s-.758.217-.958.562L3.364 9.263c-.184.354-.555.577-.962.577H.14c.148.093 2.16 3.743 2.353 4.076L7.221 22.1c.21.35.58.58 1.01.58h7.02c.4 0 .8-.23 1-.58l4.096-8.184zm-5.741-2.261l-1.606 2.78c-.2.34-.56.57-.96.57s-.76-.23-.96-.57l-1.62-2.78 1.62-2.78c.2-.34.56-.57.96-.57s.76.23.96.57l1.606 2.78z"/>
                    </svg>
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-green-500 text-white p-1 rounded-full border-4 border-white dark:border-[#1E293B]">
                    {/* Tiny lock/shield icon */}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-serif italic text-[#4A5759] dark:text-white">
                    Hubungkan Google Drive Anda
                  </h3>
                  <p className="text-xs text-muted dark:text-[#94A3B8] mt-1.5 px-4 leading-relaxed">
                    Sebelum Anda dapat mencari dan memilih media untuk ditambahkan ke postingan curhatan Anda, kami membutuhkan izin akses Anda.
                  </p>
                </div>

                {/* Consent Bullet Points */}
                <div className="w-full bg-zinc-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-[#F2F0EB] dark:border-white/5 space-y-3 text-left">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-indigo-100 dark:bg-indigo-950/50 rounded-full flex items-center justify-center text-indigo-500 shrink-0 mt-0.5">
                      <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#4A5759] dark:text-white">
                        Akses Terbatas (Read-Only)
                      </h4>
                      <p className="text-[10px] text-muted dark:text-[#94A3B8] mt-0.5 leading-normal">
                        Aplikasi ini hanya dapat melihat daftar file dan mengunduh konten file gambar/video yang Anda pilih secara sadar.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-indigo-100 dark:bg-indigo-950/50 rounded-full flex items-center justify-center text-indigo-500 shrink-0 mt-0.5">
                      <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#4A5759] dark:text-white">
                        Privasi & Keamanan Terjaga
                      </h4>
                      <p className="text-[10px] text-muted dark:text-[#94A3B8] mt-0.5 leading-normal">
                        Proses otentikasi login aman menggunakan portal resmi Google. Token Anda hanya dipakai secara instan di sisi browser Anda.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-indigo-100 dark:bg-indigo-950/50 rounded-full flex items-center justify-center text-indigo-500 shrink-0 mt-0.5">
                      <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#4A5759] dark:text-white">
                        Kemudahan Kontrol
                      </h4>
                      <p className="text-[10px] text-muted dark:text-[#94A3B8] mt-0.5 leading-normal">
                        Akses Google Drive ini dapat dicabut kapan pun diinginkan melalui menu keamanan Google Account Anda.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Confirm / Cancel Buttons */}
                <div className="w-full pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDriveConsent(false);
                      openGooglePicker();
                    }}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wider uppercase transition-all shadow-md active:scale-95"
                  >
                    Setuju & Hubungkan
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDriveConsent(false)}
                    className="flex-1 py-3 border border-neutral-200 dark:border-white/10 text-[#4A5759] dark:text-[#94A3B8] hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-xs font-semibold tracking-wider uppercase transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
