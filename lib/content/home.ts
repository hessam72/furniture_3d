/**
 * Every string the homepage and its shared chrome (header, mobile menu)
 * render, in both locales.
 *
 * Headings are split into segments so a word can be marked `gold: true` —
 * the design rule is "bold white text, only key words in gold". Kept as a
 * typed `Record<Locale, HomeCopy>` rather than ICU messages, exactly like
 * `components/about/content.ts` already does for the About page: a heading's
 * `gold` flags are structure, not text, and next-intl's ICU messages have no
 * good way to carry that — ICU ordinal `{gender, select}`-style tricks would
 * fight the format for something that isn't a plural or gender choice.
 *
 * `AR_PAGE` at the bottom is intentionally **not** part of this record — the
 * `/ar` page is out of this rollout's scope and stays Persian-only under
 * both locale prefixes for now.
 */
import type { Locale } from "@/i18n/routing";

export type HeadingSegment = { text: string; gold?: boolean };

export interface HomeCopy {
  ui: {
    skipToContent: string;
    openMenu: string;
    closeMenu: string;
    mainMenu: string;
    scrollToShowroom: string;
    langLabel: string;
  };
  contactPhoneDisplay: string;
  contactPhoneHref: string;
  brand: { name: string; tagline: string; logoSrc: string };
  navLinks: { label: string; href: string }[];
  hero: {
    eyebrow: string;
    heading: HeadingSegment[];
    description: string;
    image: { src: string; alt: string; label: string };
    scrollCue: string;
  };
  showroom: {
    id: string;
    eyebrow: string;
    heading: HeadingSegment[];
    description: string;
    image: { src: string; alt: string; label: string };
    cta: { label: string; href: string };
  };
  colorSwap: {
    id: string;
    eyebrow: string;
    heading: HeadingSegment[];
    description: string;
    before: { src: string; alt: string; label: string };
    after: { src: string; alt: string; label: string };
    beforeLabel: string;
    afterLabel: string;
    dragHint: string;
    sliderAriaLabel: string;
    swatches: { name: string; hex: string }[];
    swatchesNote: string;
  };
  arFeature: {
    id: string;
    eyebrow: string;
    heading: HeadingSegment[];
    description: string;
    image: { src: string; alt: string; label: string };
    cta: { label: string; href: string };
  };
  keyFeatures: { label: string; icon: FeatureIcon }[];
  keyFeaturesSection: { id: string; eyebrow: string; heading: HeadingSegment[] };
  callToAction: { id: string; heading: HeadingSegment[]; description: string; buttonLabel: string };
  whyUs: { label: string; icon: WhyIcon }[];
  whyUsSection: { id: string; eyebrow: string; heading: HeadingSegment[] };
  footer: { description: string; rights: string };
}

export type FeatureIcon =
  | "palette"
  | "cube"
  | "catalog"
  | "ar"
  | "mobile"
  | "install";

export type WhyIcon = "clock" | "trust" | "growth" | "support";

const fa: HomeCopy = {
  ui: {
    skipToContent: "رفتن به محتوای اصلی",
    openMenu: "باز کردن منو",
    closeMenu: "بستن منو",
    mainMenu: "منوی اصلی",
    scrollToShowroom: "رفتن به بخش شوروم سه‌بعدی",
    langLabel: "زبان",
  },
  contactPhoneDisplay: "۰۹۱۲۹۲۱۴۷۴۲",
  contactPhoneHref: "tel:+989129214742",
  brand: {
    name: "شهر امید",
    tagline: "نمایشگاه مجازی مبلمان",
    logoSrc: "/images/Furnitures OC LOGO.png",
  },
  navLinks: [
    { label: "خانه", href: "#top" },
    { label: "نمایشگاه سه‌بعدی", href: "/store" },
    { label: "درباره ما", href: "/about" },
    { label: "امکانات", href: "#features" },
    { label: "واقعیت افزوده", href: "#ar" },
    { label: "تماس با ما", href: "#contact" },
  ],
  hero: {
    eyebrow: "نمایشگاه مجازی مبلمان",
    heading: [
      { text: "هر مبلمان\n" },
      { text: "یک تجربه ", gold: false },
      { text: "دیجیتال", gold: true },
    ],
    description:
      "مشتری بدون نصب هیچ برنامه‌ای وارد نمایشگاه اختصاصی شما می‌شود، رنگ مبلمان را در لحظه تغییر می‌دهد و آن را در خانه‌ی خودش می‌بیند.",
    image: {
      src: "/images/homepage/hero-image.webp",
      alt: "نمای داخلی نمایشگاه مبلمان",
      label: "تصویر اصلی صفحه",
    },
    scrollCue: "",
  },
  showroom: {
    id: "showroom",
    eyebrow: "نمایشگاه سه‌بعدی",
    heading: [
      { text: "نمایشگاه شما، " },
      { text: "بدون مرز", gold: true },
    ],
    description:
      "فضای نمایشگاه‌تان را دقیقاً همان‌طور که هست بازسازی می‌کنیم. بازدیدکننده در آن قدم می‌زند، محصولات را از هر زاویه می‌بیند و بدون هیچ فشاری تصمیم می‌گیرد.",
    image: {
      src: "/images/homepage/show-room-2.webp",
      alt: "نمای نمایشگاه سه‌بعدی",
      label: "تصویر نمایشگاه",
    },
    cta: { label: "ورود به نمایشگاه سه‌بعدی", href: "/store" },
  },
  colorSwap: {
    id: "features",
    eyebrow: "امکانات ما",
    heading: [
      { text: " شخصی سازی  " },
      { text: " در لحظه ", gold: true },
      { text: "مبلمان" },
    ],
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
    swatches: [
      { name: "خاکستری زغالی", hex: "#36454F" },
      { name: "بژ", hex: "#D4C5B9" },
      { name: "سرمه‌ای", hex: "#1B2F5C" },
      { name: "گردویی", hex: "#5C4033" },
      { name: "بلوط روشن", hex: "#C19A6B" },
    ],
    swatchesNote: "نمونه رنگ‌های نمایشی — انتخاب رنگ در نمایشگاه سه‌بعدی انجام می‌شود.",
  },
  arFeature: {
    id: "ar-feature",
    eyebrow: "واقعیت افزوده",
    heading: [
      { text: "انتخابتان را در " },
      { text: "خانه‌ی خود", gold: true },
      { text: " ببینید" },
    ],
    description:
      "با واقعیت افزوده، محصول در اندازه‌ی واقعی روی زمین خانه‌ی مشتری قرار می‌گیرد؛ تردید برای خرید از بین می‌رود.",
    image: {
      src: "/images/homepage/view-in-ar.webp",
      alt: "نمایش مبل در فضای خانه با واقعیت افزوده",
      label: "تصویر واقعیت افزوده",
    },
    cta: { label: "مشاهده در واقعیت افزوده", href: "/ar" },
  },
  keyFeatures: [
    { label: "تغییر رنگ متریال در لحظه", icon: "palette" },
    { label: "نمایشگاه سه‌بعدی اختصاصی", icon: "cube" },
    { label: "بیش از ۶۰ مدل محصول", icon: "catalog" },
    { label: "نمایش در واقعیت افزوده", icon: "ar" },
    { label: "سازگار با موبایل", icon: "mobile" },
    { label: "دسترسی آسان بدون نیاز به نصب", icon: "install" },
  ],
  keyFeaturesSection: {
    id: "features",
    eyebrow: "قابلیت‌ها",
    heading: [
      { text: "هر چیزی که یک نمایشگاه " },
      { text: "مدرن", gold: true },
      { text: " لازم دارد" },
    ],
  },
  callToAction: {
    id: "call-to-action",
    heading: [
      { text: "آماده‌ی ساخت " },
      { text: "نمایشگاه اختصاصی", gold: true },
      { text: " خود هستید؟" },
    ],
    description: "همین حالا تماس بگیرید تا نمایشگاه شما را سه‌بعدی کنیم.",
    buttonLabel: "تماس بگیرید",
  },
  whyUs: [
    { label: "صرفه‌جویی در زمان و هزینه", icon: "clock" },
    { label: "اعتماد بیشتر مشتریان", icon: "trust" },
    { label: "افزایش نرخ فروش", icon: "growth" },
    { label: "پشتیبانی اختصاصی", icon: "support" },
  ],
  whyUsSection: {
    id: "why",
    eyebrow: "چرا ما؟",
    heading: [
      { text: "نتیجه‌ای که " },
      { text: "احساس می‌کنید", gold: true },
    ],
  },
  footer: {
    description: "نمایشگاه مجازی مبلمان — نمایشگاه سه‌بعدی و واقعیت افزوده",
    rights: "تمامی حقوق محفوظ است.",
  },
};

const en: HomeCopy = {
  ui: {
    skipToContent: "Skip to main content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    mainMenu: "Main menu",
    scrollToShowroom: "Go to the 3D showroom section",
    langLabel: "Language",
  },
  contactPhoneDisplay: "0912 921 4742",
  contactPhoneHref: "tel:+989129214742",
  brand: {
    name: "Shahr-e Omid",
    tagline: "Virtual Furniture Showroom",
    logoSrc: "/images/Furnitures OC LOGO.png",
  },
  navLinks: [
    { label: "Home", href: "#top" },
    { label: "3D Showroom", href: "/store" },
    { label: "About Us", href: "/about" },
    { label: "Features", href: "#features" },
    { label: "AR", href: "#ar" },
    { label: "Contact Us", href: "#contact" },
  ],
  hero: {
    eyebrow: "Virtual Furniture Showroom",
    heading: [
      { text: "Every piece,\n" },
      { text: "a ", gold: false },
      { text: "digital", gold: true },
      { text: " experience" },
    ],
    description:
      "Customers step into your own showroom with no app to install, change the furniture's color on the spot, and see it in their own home.",
    image: {
      src: "/images/homepage/hero-image.webp",
      alt: "Interior view of the furniture showroom",
      label: "Main page image",
    },
    scrollCue: "",
  },
  showroom: {
    id: "showroom",
    eyebrow: "3D Showroom",
    heading: [
      { text: "Your showroom, " },
      { text: "without borders", gold: true },
    ],
    description:
      "We rebuild your showroom exactly as it is. Visitors walk through it, see every product from any angle, and decide with no pressure at all.",
    image: {
      src: "/images/homepage/show-room-2.webp",
      alt: "View of the 3D showroom",
      label: "Showroom image",
    },
    cta: { label: "Enter the 3D showroom", href: "/store" },
  },
  colorSwap: {
    id: "features",
    eyebrow: "Our Features",
    heading: [
      { text: "Customize your " },
      { text: "furniture instantly", gold: true },
    ],
    description:
      "Change the fabric and color with a single touch. Customers see the same sofa in dozens of colors, without your warehouse stocking dozens of models.",
    before: {
      src: "/images/homepage/before-img.webp",
      alt: "Sofa in its original color",
      label: "Before image",
    },
    after: {
      src: "/images/homepage/after-img.webp",
      alt: "The same sofa in a new color",
      label: "After image",
    },
    beforeLabel: "Before",
    afterLabel: "After",
    dragHint: "Drag the handle",
    sliderAriaLabel: "Compare sofa colors",
    swatches: [
      { name: "Charcoal Grey", hex: "#36454F" },
      { name: "Beige", hex: "#D4C5B9" },
      { name: "Navy", hex: "#1B2F5C" },
      { name: "Walnut", hex: "#5C4033" },
      { name: "Light Oak", hex: "#C19A6B" },
    ],
    swatchesNote: "Sample colors shown for illustration — color selection happens inside the 3D showroom.",
  },
  arFeature: {
    id: "ar-feature",
    eyebrow: "Augmented Reality",
    heading: [
      { text: "See your choice in " },
      { text: "your own home", gold: true },
    ],
    description:
      "With augmented reality, the product appears at true size on the customer's own floor — removing any hesitation about buying.",
    image: {
      src: "/images/homepage/view-in-ar.webp",
      alt: "A sofa shown in a home space with augmented reality",
      label: "AR image",
    },
    cta: { label: "View in AR", href: "/ar" },
  },
  keyFeatures: [
    { label: "Instant material color changes", icon: "palette" },
    { label: "Your own dedicated 3D showroom", icon: "cube" },
    { label: "Over 60 product models", icon: "catalog" },
    { label: "Augmented-reality preview", icon: "ar" },
    { label: "Works great on mobile", icon: "mobile" },
    { label: "Easy access — nothing to install", icon: "install" },
  ],
  keyFeaturesSection: {
    id: "features",
    eyebrow: "Capabilities",
    heading: [
      { text: "Everything a " },
      { text: "modern", gold: true },
      { text: " showroom needs" },
    ],
  },
  callToAction: {
    id: "call-to-action",
    heading: [
      { text: "Ready to build " },
      { text: "your own showroom", gold: true },
      { text: "?" },
    ],
    description: "Get in touch now and we'll turn your showroom into a 3D experience.",
    buttonLabel: "Contact us",
  },
  whyUs: [
    { label: "Save time and cost", icon: "clock" },
    { label: "More customer trust", icon: "trust" },
    { label: "Higher conversion rate", icon: "growth" },
    { label: "Dedicated support", icon: "support" },
  ],
  whyUsSection: {
    id: "why",
    eyebrow: "Why Us?",
    heading: [
      { text: "A result you can " },
      { text: "feel", gold: true },
    ],
  },
  footer: {
    description: "Virtual Furniture Showroom — 3D showroom and augmented reality",
    rights: "All rights reserved.",
  },
};

const HOME_COPY: Record<Locale, HomeCopy> = { fa, en };

export function getHomeCopy(locale: Locale): HomeCopy {
  return HOME_COPY[locale];
}

/** The `/ar` page's copy — out of this rollout's scope, so Persian-only. */
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
