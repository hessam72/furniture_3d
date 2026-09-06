/**
 * Every Farsi string on the homepage lives here.
 *
 * Headings are split into segments so a word can be marked `gold: true` —
 * the design rule is "bold white text, only key words in gold".
 */

export type HeadingSegment = { text: string; gold?: boolean };

export const CONTACT_PHONE_DISPLAY = "۰۹۱۲۹۲۱۴۷۴۲";
/** E.164 for the tel: href — must stay ASCII. */
export const CONTACT_PHONE_HREF = "tel:+989129214742";

export const BRAND = {
  name: "شهر امید",
  tagline: "نمایشگاه مجازی مبلمان",
  logoSrc: "/images/Furnitures OC LOGO.png",
} as const;

export const NAV_LINKS = [
  { label: "خانه", href: "#top" },
  { label: "نمایشگاه سه‌بعدی", href: "/store" },
    { label: "درباره ما", href: "/about" },

  { label: "امکانات", href: "#features" },
  { label: "واقعیت افزوده", href: "#ar" },
  { label: "تماس با ما", href: "#contact" },
] as const;

export const HERO = {
  eyebrow: "نمایشگاه مجازی مبلمان",
  heading: [
    { text: "هر مبلمان\n" },
    { text: "یک تجربه ", gold: false },
    { text: "دیجیتال", gold: true },
  ] as HeadingSegment[],
  description:
    "مشتری بدون نصب هیچ برنامه‌ای وارد نمایشگاه اختصاصی شما می‌شود، رنگ مبلمان را در لحظه تغییر می‌دهد و آن را در خانه‌ی خودش می‌بیند.",
  image: {
    src: "/images/homepage/hero-image.webp",
    alt: "نمای داخلی نمایشگاه مبلمان",
    label: "تصویر اصلی صفحه",
  },
  scrollCue: "",
} as const;

export const SHOWROOM = {
  id: "showroom",
  eyebrow: "نمایشگاه سه‌بعدی",
  heading: [
    { text: "نمایشگاه شما، " },
    { text: "بدون مرز", gold: true },
  ] as HeadingSegment[],
  description:
    "فضای نمایشگاه‌تان را دقیقاً همان‌طور که هست بازسازی می‌کنیم. بازدیدکننده در آن قدم می‌زند، محصولات را از هر زاویه می‌بیند و بدون هیچ فشاری تصمیم می‌گیرد.",
  image: {
    src: "/images/homepage/show-room-2.webp",
    alt: "نمای نمایشگاه سه‌بعدی",
    label: "تصویر نمایشگاه",
  },
  cta: { label: "ورود به نمایشگاه سه‌بعدی", href: "/store" },
} as const;

export const COLOR_SWAP = {
  id: "features",
  eyebrow: "امکانات ما",
  heading: [
    { text: " شخصی سازی  " },
    { text: " در لحظه ", gold: true },
    { text: "مبلمان" },
  ] as HeadingSegment[],
  description:
    "پارچه و رنگ را با یک لمس عوض کنید. مشتری همان مبل را در ده‌ها رنگ می‌بیند، بدون اینکه انبار شما ده‌ها مدل داشته باشد.",
  before: {
    src: "/images/homepage/before-img.webp",
    alt: "مبل با رنگ اولیه",
    label: "تصویر قبل",
  },
  after: {
    src: "/images/homepage/after-img.webp",
    alt: "همان مبل با رنگ جدید",
    label: "تصویر بعد",
  },
  beforeLabel: "قبل",
  afterLabel: "بعد",
  dragHint: "دستگیره را بکشید",
  sliderAriaLabel: "مقایسه رنگ مبل",
  /** Presentational only — mirrors the real swatches in public/config/products.json */
  swatches: [
    { name: "خاکستری زغالی", hex: "#36454F" },
    { name: "بژ", hex: "#D4C5B9" },
    { name: "سرمه‌ای", hex: "#1B2F5C" },
    { name: "گردویی", hex: "#5C4033" },
    { name: "بلوط روشن", hex: "#C19A6B" },
  ],
  swatchesNote: "نمونه رنگ‌های نمایشی — انتخاب رنگ در نمایشگاه سه‌بعدی انجام می‌شود.",
} as const;

export const AR_FEATURE = {
  id: "ar-feature",
  eyebrow: "واقعیت افزوده",
  heading: [
    { text: "انتخابتان را در " },
    { text: "خانه‌ی خود", gold: true },
    { text: " ببینید" },
  ] as HeadingSegment[],
  description:
    "با واقعیت افزوده، محصول در اندازه‌ی واقعی روی زمین خانه‌ی مشتری قرار می‌گیرد؛ تردید برای خرید از بین می‌رود.",
  image: {
    src: "/images/homepage/view-in-ar.webp",
    alt: "نمایش مبل در فضای خانه با واقعیت افزوده",
    label: "تصویر واقعیت افزوده",
  },
  cta: { label: "مشاهده در واقعیت افزوده", href: "/ar" },
} as const;

export type FeatureIcon =
  | "palette"
  | "cube"
  | "catalog"
  | "ar"
  | "mobile"
  | "install";

export const KEY_FEATURES: { label: string; icon: FeatureIcon }[] = [

  { label: "تغییر رنگ متریال در لحظه", icon: "palette" },
  { label: "نمایشگاه سه‌بعدی اختصاصی", icon: "cube" },
  { label: "بیش از ۶۰ مدل محصول", icon: "catalog" },
  { label: "نمایش در واقعیت افزوده", icon: "ar" },
  { label: "سازگار با موبایل", icon: "mobile" },
  { label: "دسترسی آسان بدون نیاز به نصب", icon: "install" },
];

export const KEY_FEATURES_SECTION = {
  id: "features",
  eyebrow: "قابلیت‌ها",
  heading: [
    { text: "هر چیزی که یک نمایشگاه " },
    { text: "مدرن", gold: true },
    { text: " لازم دارد" },
  ] as HeadingSegment[],
} as const;

export const CALL_TO_ACTION = {
  id: "call-to-action",
  heading: [
    { text: "آماده‌ی ساخت " },
    { text: "نمایشگاه اختصاصی", gold: true },
    { text: " خود هستید؟" },
  ] as HeadingSegment[],
  description:
    "همین حالا تماس بگیرید تا نمایشگاه شما را سه‌بعدی کنیم.",
  buttonLabel: "تماس بگیرید",
} as const;

export type WhyIcon = "clock" | "trust" | "growth" | "support";

export const WHY_US: { label: string; icon: WhyIcon }[] = [
  { label: "صرفه‌جویی در زمان و هزینه", icon: "clock" },
  { label: "اعتماد بیشتر مشتریان", icon: "trust" },
  { label: "افزایش نرخ فروش", icon: "growth" },
  { label: "پشتیبانی اختصاصی", icon: "support" },
];

export const WHY_US_SECTION = {
  id: "why",
  eyebrow: "چرا ما؟",
  heading: [
    { text: "نتیجه‌ای که " },
    { text: "احساس می‌کنید", gold: true },
  ] as HeadingSegment[],
} as const;

export const FOOTER = {
  description: "نمایشگاه مجازی مبلمان — نمایشگاه سه‌بعدی و واقعیت افزوده",
  rights: "تمامی حقوق محفوظ است.",
} as const;

export const AR_PAGE = {
  title: "نمایش در واقعیت افزوده",
  description:
    "محصول را انتخاب کنید و آن را در فضای واقعی خود ببینید. روی گوشی موبایل، دکمه‌ی واقعیت افزوده را بزنید.",
  back: "بازگشت به خانه",
  toStore: "ورود به نمایشگاه سه‌بعدی",
  loading: "در حال بارگذاری مدل سه‌بعدی…",
  missingTitle: "مدل سه‌بعدی این محصول هنوز آپلود نشده است",
  missingBody:
    "فایل‌های مدل در مخزن نگهداری نمی‌شوند. فایل مربوطه را در پوشه‌ی مدل‌ها قرار دهید تا این بخش فعال شود.",
  desktopNotice:
    "واقعیت افزوده روی رایانه در دسترس نیست. این صفحه را با گوشی موبایل باز کنید.",
  arButton: "مشاهده در واقعیت افزوده",
  productNames: {
    "modern-sofa": "مبل راحتی مدرن",
    "dining-chair": "صندلی ناهارخوری نوردیک",
    "coffee-table": "میز جلومبلی مینیمال",
    bookshelf: "کتابخانه صنعتی",
    armchair: "مبل تک‌نفره",
    "side-table": "میز کناری",
  } as Record<string, string>,
} as const;
