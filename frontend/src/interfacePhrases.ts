// Frequently used navigation and actions are available even when the browser has no translation model.
const english = ["Language", "Home", "Projects", "Settings", "Dashboard", "Asset library", "Generator home", "All tools", "Sign in", "Sign out", "Save", "Cancel", "Export", "Download", "Search", "Start for free", "Features", "Pricing", "Video Editing", "Workspace", "My channel"];
const rows: Record<string, string> = {
  hi: "भाषा|होम|प्रोजेक्ट|सेटिंग्स|डैशबोर्ड|मीडिया लाइब्रेरी|जनरेटर होम|सभी टूल|साइन इन करें|साइन आउट करें|सहेजें|रद्द करें|निर्यात करें|डाउनलोड करें|खोजें|मुफ़्त शुरू करें|सुविधाएँ|मूल्य|वीडियो संपादन|कार्यस्थान|मेरा चैनल",
  te: "భాష|హోమ్|ప్రాజెక్టులు|సెట్టింగ్‌లు|డాష్‌బోర్డ్|మీడియా లైబ్రరీ|జనరేటర్ హోమ్|అన్ని సాధనాలు|సైన్ ఇన్|సైన్ అవుట్|సేవ్ చేయి|రద్దు చేయి|ఎగుమతి|డౌన్‌లోడ్|వెతకండి|ఉచితంగా ప్రారంభించండి|ఫీచర్లు|ధరలు|వీడియో ఎడిటింగ్|కార్యస్థలం|నా ఛానెల్",
  ta: "மொழி|முகப்பு|திட்டங்கள்|அமைப்புகள்|கட்டுப்பாட்டுப் பலகை|ஊடக நூலகம்|உருவாக்கி முகப்பு|அனைத்துக் கருவிகள்|உள்நுழை|வெளியேறு|சேமி|ரத்து செய்|ஏற்றுமதி|பதிவிறக்கு|தேடு|இலவசமாகத் தொடங்கு|அம்சங்கள்|விலை|காணொளித் தொகுப்பு|பணியிடம்|எனது சேனல்",
  kn: "ಭಾಷೆ|ಮುಖಪುಟ|ಯೋಜನೆಗಳು|ಸೆಟ್ಟಿಂಗ್‌ಗಳು|ಡ್ಯಾಶ್‌ಬೋರ್ಡ್|ಮಾಧ್ಯಮ ಗ್ರಂಥಾಲಯ|ಜನರೇಟರ್ ಮುಖಪುಟ|ಎಲ್ಲಾ ಪರಿಕರಗಳು|ಸೈನ್ ಇನ್|ಸೈನ್ ಔಟ್|ಉಳಿಸಿ|ರದ್ದುಮಾಡಿ|ರಫ್ತು|ಡೌನ್‌ಲೋಡ್|ಹುಡುಕಿ|ಉಚಿತವಾಗಿ ಪ್ರಾರಂಭಿಸಿ|ವೈಶಿಷ್ಟ್ಯಗಳು|ಬೆಲೆಗಳು|ವೀಡಿಯೊ ಸಂಪಾದನೆ|ಕಾರ್ಯಕ್ಷೇತ್ರ|ನನ್ನ ಚಾನಲ್",
  bn: "ভাষা|হোম|প্রকল্প|সেটিংস|ড্যাশবোর্ড|মিডিয়া লাইব্রেরি|জেনারেটর হোম|সব টুল|সাইন ইন|সাইন আউট|সংরক্ষণ|বাতিল|রপ্তানি|ডাউনলোড|অনুসন্ধান|বিনামূল্যে শুরু করুন|বৈশিষ্ট্য|মূল্য|ভিডিও সম্পাদনা|কর্মক্ষেত্র|আমার চ্যানেল",
  mr: "भाषा|मुख्यपृष्ठ|प्रकल्प|सेटिंग्ज|डॅशबोर्ड|मीडिया संग्रह|जनरेटर मुख्यपृष्ठ|सर्व साधने|साइन इन करा|साइन आउट करा|जतन करा|रद्द करा|निर्यात|डाउनलोड|शोधा|मोफत सुरू करा|वैशिष्ट्ये|किंमती|व्हिडिओ संपादन|कार्यक्षेत्र|माझे चॅनेल",
  es: "Idioma|Inicio|Proyectos|Configuración|Panel|Biblioteca multimedia|Inicio del generador|Todas las herramientas|Iniciar sesión|Cerrar sesión|Guardar|Cancelar|Exportar|Descargar|Buscar|Empezar gratis|Funciones|Precios|Edición de vídeo|Espacio de trabajo|Mi canal",
  fr: "Langue|Accueil|Projets|Paramètres|Tableau de bord|Médiathèque|Accueil du générateur|Tous les outils|Se connecter|Se déconnecter|Enregistrer|Annuler|Exporter|Télécharger|Rechercher|Commencer gratuitement|Fonctionnalités|Tarifs|Montage vidéo|Espace de travail|Ma chaîne",
  de: "Sprache|Startseite|Projekte|Einstellungen|Übersicht|Mediathek|Generator-Startseite|Alle Werkzeuge|Anmelden|Abmelden|Speichern|Abbrechen|Exportieren|Herunterladen|Suchen|Kostenlos starten|Funktionen|Preise|Videobearbeitung|Arbeitsbereich|Mein Kanal",
  pt: "Idioma|Início|Projetos|Configurações|Painel|Biblioteca de mídia|Início do gerador|Todas as ferramentas|Entrar|Sair|Salvar|Cancelar|Exportar|Baixar|Pesquisar|Começar grátis|Recursos|Preços|Edição de vídeo|Área de trabalho|Meu canal",
  ar: "اللغة|الرئيسية|المشاريع|الإعدادات|لوحة التحكم|مكتبة الوسائط|صفحة المولّد|كل الأدوات|تسجيل الدخول|تسجيل الخروج|حفظ|إلغاء|تصدير|تنزيل|بحث|ابدأ مجانًا|الميزات|الأسعار|تحرير الفيديو|مساحة العمل|قناتي",
  ja: "言語|ホーム|プロジェクト|設定|ダッシュボード|メディアライブラリ|生成ツールのホーム|すべてのツール|ログイン|ログアウト|保存|キャンセル|書き出し|ダウンロード|検索|無料で始める|機能|料金|動画編集|ワークスペース|マイチャンネル",
  zh: "语言|首页|项目|设置|控制面板|媒体库|生成器首页|全部工具|登录|退出登录|保存|取消|导出|下载|搜索|免费开始|功能|价格|视频编辑|工作区|我的频道",
};
export const navigationLanguages = Object.keys(rows);
const phrases = Object.fromEntries(Object.entries(rows).map(([code, row]) => {
  const values = row.split("|");
  return [code, Object.fromEntries(english.map((key, i) => [key.toLowerCase(), values[i]]))];
}));
export function navigationPhrase(code: string, source: string): string | undefined {
  return phrases[code]?.[source.trim().toLowerCase()];
}
