import {
  AlertTriangle, ArrowLeft, ArrowRight, Ban, BarChart3, Bell, BookOpen, Briefcase,
  Building2, Calendar, Camera, Check, CheckCircle, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, Circle, CircleDot, Clipboard, Copy, CornerDownRight,
  CreditCard, DollarSign, Download, Droplets, ExternalLink, Eye, EyeOff, File,
  FilePlus, FileSearch, FileText, Filter, GitBranch, GripVertical, History,
  Image as ImageIcon, Info, Kanban, Layers, LayoutTemplate, LifeBuoy, Link2,
  ListChecks, Loader2, Lock, LogOut, Mail, Menu, Minus, Paperclip, PenLine,
  Phone, Plus, Receipt, RotateCcw, Ruler, Save, Search, Send, Settings,
  SlidersHorizontal, Trash2, TrendingUp, Undo2, Upload, UserPlus, Users, X,
  type LucideIcon,
} from "lucide-react";

/**
 * The prototype pulled Lucide from a CDN and rendered icons by name into a
 * `<span>` after mount. That cost a layout shift on every icon and put a network
 * dependency in the render path. Here the same string names map to imported
 * components, so the set is tree-shaken to exactly what the app uses and the
 * icon is present in the first paint.
 *
 * Names stay kebab-case to match the prototype's JSX and the `icon` column on
 * `job_templates`, which stores names the operator can edit.
 */
const ICONS: Record<string, LucideIcon> = {
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  ban: Ban,
  "bar-chart-3": BarChart3,
  bell: Bell,
  "book-open": BookOpen,
  briefcase: Briefcase,
  "building-2": Building2,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  "check-circle": CheckCircle,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  circle: Circle,
  "circle-dot": CircleDot,
  clipboard: Clipboard,
  copy: Copy,
  "corner-down-right": CornerDownRight,
  "credit-card": CreditCard,
  "dollar-sign": DollarSign,
  download: Download,
  droplets: Droplets,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  file: File,
  "file-plus": FilePlus,
  "file-search": FileSearch,
  "file-text": FileText,
  filter: Filter,
  "git-branch": GitBranch,
  "grip-vertical": GripVertical,
  history: History,
  image: ImageIcon,
  info: Info,
  kanban: Kanban,
  layers: Layers,
  "layout-template": LayoutTemplate,
  "life-buoy": LifeBuoy,
  "link-2": Link2,
  "list-checks": ListChecks,
  "loader-2": Loader2,
  lock: Lock,
  "log-out": LogOut,
  mail: Mail,
  menu: Menu,
  minus: Minus,
  paperclip: Paperclip,
  "pen-line": PenLine,
  phone: Phone,
  plus: Plus,
  receipt: Receipt,
  "rotate-ccw": RotateCcw,
  ruler: Ruler,
  save: Save,
  search: Search,
  send: Send,
  settings: Settings,
  "sliders-horizontal": SlidersHorizontal,
  "trash-2": Trash2,
  "trending-up": TrendingUp,
  "undo-2": Undo2,
  upload: Upload,
  "user-plus": UserPlus,
  users: Users,
  x: X,
};

export interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  className,
  color,
  style,
}: IconProps) {
  // An unknown name is a typo, not a crash. Fall back to a neutral dot so the
  // layout holds and the missing glyph is visible in review.
  const Glyph = ICONS[name] ?? Circle;
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", color, ...style }}
    >
      <Glyph size={size} strokeWidth={strokeWidth} aria-hidden="true" />
    </span>
  );
}

/** The brand lockup — a roof, drawn rather than loaded. */
export function RoofMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.2V20h14v-9.8" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  );
}
