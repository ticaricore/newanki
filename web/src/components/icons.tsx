// Icon set: the design's names mapped to lucide-react (same 1.5px Lucide stroke style).
import {
  ArrowLeft, ArrowRight, Bell, Book, Brain, Calendar, Camera, ChartLine, Check, ChevronDown, ChevronLeft,
  ChevronRight, Clock, Download, Ellipsis, Eye, EyeOff, Flame, Funnel, Globe, Heart, House, Image, KeyRound,
  Languages, Layers, LogOut, Mic, Moon, MoveHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Search, Settings,
  Share2, Shield, Sparkles, Star, Sun, Target, Trash2, Trophy, Type, Upload, User, Volume2, X, Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS = {
  home: House,
  layers: Layers,
  brain: Brain,
  chart: ChartLine,
  search: Search,
  settings: Settings,
  plus: Plus,
  close: X,
  check: Check,
  chevronR: ChevronRight,
  chevronL: ChevronLeft,
  chevronD: ChevronDown,
  arrowR: ArrowRight,
  arrowL: ArrowLeft,
  more: Ellipsis,
  edit: Pencil,
  trash: Trash2,
  filter: Funnel,
  share: Share2,
  flame: Flame,
  clock: Clock,
  bolt: Zap,
  trophy: Trophy,
  target: Target,
  refresh: RefreshCw,
  textT: Type,
  speaker: Volume2,
  image: Image,
  book: Book,
  mic: Mic,
  camera: Camera,
  sparkle: Sparkles,
  user: User,
  bell: Bell,
  globe: Globe,
  moon: Moon,
  sun: Sun,
  download: Download,
  upload: Upload,
  play: Play,
  pause: Pause,
  star: Star,
  heart: Heart,
  calendar: Calendar,
  swipe: MoveHorizontal,
  langTr: Languages,
  logout: LogOut,
  shield: Shield,
  key: KeyRound,
  eye: Eye,
  eyeOff: EyeOff,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  color?: string
  className?: string
}

export function Icon({ name, size = 20, strokeWidth = 1.5, color = 'currentColor', className }: IconProps) {
  const C = ICONS[name]
  return <C size={size} strokeWidth={strokeWidth} color={color} className={className} aria-hidden style={{ flexShrink: 0 }} />
}
