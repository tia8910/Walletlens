// Terms of Service, per language. Same structure and mini-syntax as
// ./privacy.js — see the note at the top of that file for why the document
// lives as structured content rather than flat keys.
//
// Section 8 previously said WalletLens integrates third-party "advertising
// (Google AdSense)". It does not: the only AdSense trace in the repository is
// a site-verification meta tag, no ad script loads and no ad slot exists. That
// was corrected here rather than carried into three more languages, and the
// Privacy Policy already says the app serves no advertising — the two
// documents now agree.

export const terms = {
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: August 2026',
    intro: 'Please read these Terms of Service ("Terms") carefully before using WalletLens ("the app", "we", "our"). By accessing or using WalletLens, you agree to be bound by these Terms.',
    sections: [
      { h: '1. Description of Service', p: [
        'WalletLens is a free, browser-based portfolio tracking application that allows users to record and monitor investments across multiple asset classes including cryptocurrencies, equities, commodities, and fiat currencies. The app runs entirely in your browser; no server stores your financial data.',
      ] },
      { h: '2. Eligibility', p: [
        'You must be at least 13 years old to use WalletLens. By using the app, you represent that you meet this age requirement. If you are under 18, you should review these Terms with a parent or guardian.',
      ] },
      { h: '3. No Financial Advice', p: [
        'WalletLens is an informational tool only. Nothing on the platform constitutes financial, investment, legal, or tax advice. All data, AI-generated insights, price alerts, risk scores, and portfolio analyses are provided for informational purposes only and should not be relied upon to make investment decisions.',
        'Always do your own research and consult a qualified financial adviser before making any investment decisions. Past performance indicators shown in the app do not guarantee future results.',
      ] },
      { h: '4. Data Accuracy', p: [
        'Price data is sourced from third-party APIs (CoinGecko, Binance, CoinCap, Gold-API, Stooq, and others). WalletLens does not guarantee the accuracy, completeness, timeliness, or fitness for any purpose of any price or market data displayed. We are not responsible for any loss arising from reliance on this data.',
      ] },
      { h: '5. Your Data', p: [
        "All portfolio data you enter is stored locally in your browser's `localStorage`. We have no access to it. You are solely responsible for maintaining backups of your data using the app's export feature. Clearing your browser data, using a new device, or uninstalling the app will permanently delete your local data unless you have exported a backup.",
      ] },
      { h: '6. Acceptable Use', p: ['You agree not to:'], ul: [
        'Use the app for any unlawful purpose or in violation of any applicable law or regulation',
        'Attempt to reverse-engineer, decompile, or disassemble any part of the app',
        'Use automated tools to scrape, overload, or abuse third-party APIs accessed through the app',
        'Misrepresent portfolio data or use the app to facilitate financial fraud',
      ] },
      { h: '7. Intellectual Property', p: [
        'The WalletLens name, logo, interface design, and original code are the property of WalletLens. Third-party cryptocurrency logos and brand assets belong to their respective owners and are used under fair-use principles for identification purposes.',
      ] },
      { h: '8. Third-Party Services', p: [
        'WalletLens integrates with third-party services for market price data and analytics (Google Analytics), and — for the optional features listed in the Privacy Policy — for email delivery and AI processing. Your use of the app is also subject to the terms and privacy policies of these third parties. We are not responsible for the practices of third-party services. WalletLens does not serve advertising in the app.',
      ] },
      { h: '9. Disclaimer of Warranties', p: [
        'WalletLens is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the app will be uninterrupted, error-free, or free of viruses. To the fullest extent permitted by applicable law, we disclaim all warranties including implied warranties of merchantability and fitness for a particular purpose.',
      ] },
      { h: '10. Limitation of Liability', p: [
        'To the maximum extent permitted by law, WalletLens and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or investment value, arising from your use of or inability to use the app.',
      ] },
      { h: '11. Modifications to the Service', p: [
        'We reserve the right to modify, suspend, or discontinue any aspect of WalletLens at any time without notice. We will not be liable to you or any third party for any modification, suspension, or discontinuation.',
      ] },
      { h: '12. Changes to These Terms', p: [
        'We may update these Terms from time to time. Changes will be posted on this page with an updated "last modified" date. Continued use of the app after any changes constitutes acceptance of the revised Terms.',
      ] },
      { h: '13. Governing Law', p: [
        'These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising from these Terms or your use of the app shall be resolved through good-faith negotiation or, if necessary, binding arbitration.',
      ] },
      { h: '14. Contact', p: [
        'If you have any questions about these Terms, please email us at [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },

  ar: {
    title: 'شروط الخدمة',
    updated: 'آخر تحديث: أغسطس 2026',
    intro: 'يُرجى قراءة شروط الخدمة هذه («الشروط») بعناية قبل استخدام WalletLens («التطبيق» أو «نحن»). وباستخدامك WalletLens أو الوصول إليه، فإنك توافق على الالتزام بهذه الشروط.',
    sections: [
      { h: '١. وصف الخدمة', p: [
        'WalletLens تطبيق مجاني لتتبّع المحافظ يعمل في المتصفح، ويتيح للمستخدمين تسجيل استثماراتهم ومتابعتها عبر فئات أصول متعددة تشمل العملات الرقمية والأسهم والسلع والعملات الورقية. ويعمل التطبيق داخل متصفحك بالكامل؛ ولا يخزّن أي خادم بياناتك المالية.',
      ] },
      { h: '٢. الأهلية', p: [
        'يجب ألا يقل عمرك عن 13 عاماً لاستخدام WalletLens. وباستخدامك التطبيق فإنك تُقرّ باستيفائك شرط السن هذا. وإذا كان عمرك دون 18 عاماً، فينبغي أن تراجع هذه الشروط مع أحد الوالدين أو وليّ الأمر.',
      ] },
      { h: '٣. ليست نصيحة مالية', p: [
        'WalletLens أداة معلوماتية فحسب. ولا يشكّل أي شيء على المنصة نصيحة مالية أو استثمارية أو قانونية أو ضريبية. وتُقدَّم جميع البيانات والرؤى المولَّدة بالذكاء الاصطناعي وتنبيهات الأسعار ودرجات المخاطر وتحليلات المحفظة لأغراض إعلامية فقط، ولا ينبغي الاعتماد عليها في اتخاذ قرارات استثمارية.',
        'قم دائماً ببحثك الخاص واستشر مستشاراً مالياً مؤهلاً قبل اتخاذ أي قرار استثماري. ومؤشرات الأداء السابق المعروضة في التطبيق لا تضمن نتائج مستقبلية.',
      ] },
      { h: '٤. دقة البيانات', p: [
        'تُستمَدّ بيانات الأسعار من واجهات برمجية تابعة لأطراف ثالثة (CoinGecko وBinance وCoinCap وGold-API وStooq وغيرها). ولا يضمن WalletLens دقة أي سعر أو بيانات سوقية معروضة ولا اكتمالها ولا حداثتها ولا ملاءمتها لأي غرض. ولسنا مسؤولين عن أي خسارة تنشأ عن الاعتماد على هذه البيانات.',
      ] },
      { h: '٥. بياناتك', p: [
        'تُخزَّن جميع بيانات المحفظة التي تُدخلها محلياً في `localStorage` داخل متصفحك. ولا يمكننا الوصول إليها. وأنت وحدك المسؤول عن الاحتفاظ بنسخ احتياطية من بياناتك باستخدام ميزة التصدير في التطبيق. ومسح بيانات متصفحك أو استخدام جهاز جديد أو إلغاء تثبيت التطبيق سيحذف بياناتك المحلية نهائياً ما لم تكن قد صدّرت نسخة احتياطية.',
      ] },
      { h: '٦. الاستخدام المقبول', p: ['أنت توافق على عدم القيام بما يلي:'], ul: [
        'استخدام التطبيق لأي غرض غير قانوني أو بما يخالف أي قانون أو لائحة سارية',
        'محاولة الهندسة العكسية للتطبيق أو فك ترجمته أو تفكيك أي جزء منه',
        'استخدام أدوات آلية لكشط الواجهات البرمجية التابعة لأطراف ثالثة التي يصل إليها التطبيق أو إثقالها أو إساءة استخدامها',
        'تحريف بيانات المحفظة أو استخدام التطبيق لتسهيل احتيال مالي',
      ] },
      { h: '٧. الملكية الفكرية', p: [
        'اسم WalletLens وشعاره وتصميم واجهته وشيفرته الأصلية هي ملك لـ WalletLens. أما شعارات العملات الرقمية وأصول العلامات التجارية التابعة لأطراف ثالثة فهي ملك لأصحابها، وتُستخدم وفق مبادئ الاستخدام العادل لأغراض التعريف.',
      ] },
      { h: '٨. خدمات الأطراف الثالثة', p: [
        'يتكامل WalletLens مع خدمات تابعة لأطراف ثالثة للحصول على بيانات أسعار السوق وللتحليلات (Google Analytics)، وكذلك — بالنسبة إلى الميزات الاختيارية المذكورة في سياسة الخصوصية — لإرسال البريد الإلكتروني ومعالجة الذكاء الاصطناعي. ويخضع استخدامك للتطبيق أيضاً لشروط هذه الأطراف الثالثة وسياسات خصوصيتها. ولسنا مسؤولين عن ممارسات خدمات الأطراف الثالثة. ولا يعرض WalletLens إعلانات داخل التطبيق.',
      ] },
      { h: '٩. إخلاء المسؤولية عن الضمانات', p: [
        'يُقدَّم WalletLens «كما هو» و«حسب توافره» دون أي ضمانات من أي نوع، صريحة كانت أم ضمنية. ولا نضمن أن يكون التطبيق متواصلاً دون انقطاع أو خالياً من الأخطاء أو الفيروسات. وإلى أقصى حد يسمح به القانون الساري، نُخلي مسؤوليتنا من جميع الضمانات، بما فيها الضمانات الضمنية بالرواج التجاري والملاءمة لغرض معيّن.',
      ] },
      { h: '١٠. حدود المسؤولية', p: [
        'إلى أقصى حد يسمح به القانون، لن يكون WalletLens ولا مشغّلوه مسؤولين عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية أو تأديبية، بما في ذلك على سبيل المثال لا الحصر خسارة الأرباح أو البيانات أو قيمة الاستثمار، الناشئة عن استخدامك للتطبيق أو عدم قدرتك على استخدامه.',
      ] },
      { h: '١١. تعديلات على الخدمة', p: [
        'نحتفظ بالحق في تعديل أي جانب من WalletLens أو تعليقه أو إيقافه في أي وقت ودون إشعار. ولن نكون مسؤولين تجاهك ولا تجاه أي طرف ثالث عن أي تعديل أو تعليق أو إيقاف.',
      ] },
      { h: '١٢. التغييرات على هذه الشروط', p: [
        'قد نحدّث هذه الشروط من حين لآخر. وستُنشَر التغييرات على هذه الصفحة مع تحديث تاريخ «آخر تعديل». ويُعدّ استمرارك في استخدام التطبيق بعد أي تغييرات قبولاً بالشروط المعدَّلة.',
      ] },
      { h: '١٣. القانون الحاكم', p: [
        'تخضع هذه الشروط للقانون الساري وتُفسَّر وفقاً له. وتُحلّ أي نزاعات تنشأ عن هذه الشروط أو عن استخدامك للتطبيق عن طريق التفاوض بحسن نية، أو عبر التحكيم المُلزِم عند الاقتضاء.',
      ] },
      { h: '١٤. التواصل', p: [
        'إذا كانت لديك أي أسئلة بشأن هذه الشروط، فيُرجى مراسلتنا على [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },

  fr: {
    title: 'Conditions d’utilisation',
    updated: 'Dernière mise à jour : août 2026',
    intro: 'Veuillez lire attentivement ces conditions d’utilisation (les « Conditions ») avant d’utiliser WalletLens (« l’application », « nous », « notre »). En accédant à WalletLens ou en l’utilisant, vous acceptez d’être lié par ces Conditions.',
    sections: [
      { h: '1. Description du service', p: [
        'WalletLens est une application gratuite de suivi de portefeuille fonctionnant dans le navigateur, qui permet d’enregistrer et de suivre des investissements dans plusieurs classes d’actifs : cryptomonnaies, actions, matières premières et devises. L’application s’exécute entièrement dans votre navigateur ; aucun serveur ne stocke vos données financières.',
      ] },
      { h: '2. Conditions d’accès', p: [
        'Vous devez avoir au moins 13 ans pour utiliser WalletLens. En utilisant l’application, vous déclarez remplir cette condition d’âge. Si vous avez moins de 18 ans, il vous est recommandé d’examiner ces Conditions avec un parent ou un tuteur.',
      ] },
      { h: '3. Absence de conseil financier', p: [
        'WalletLens est un outil d’information uniquement. Rien sur la plateforme ne constitue un conseil financier, d’investissement, juridique ou fiscal. Toutes les données, analyses générées par IA, alertes de prix, scores de risque et analyses de portefeuille sont fournis à titre informatif et ne doivent pas servir de fondement à des décisions d’investissement.',
        'Faites toujours vos propres recherches et consultez un conseiller financier qualifié avant toute décision d’investissement. Les indicateurs de performance passée affichés dans l’application ne préjugent pas des résultats futurs.',
      ] },
      { h: '4. Exactitude des données', p: [
        'Les données de prix proviennent d’API tierces (CoinGecko, Binance, CoinCap, Gold-API, Stooq et d’autres). WalletLens ne garantit ni l’exactitude, ni l’exhaustivité, ni l’actualité, ni l’adéquation à un usage quelconque des prix ou données de marché affichés. Nous ne sommes pas responsables des pertes résultant de la confiance accordée à ces données.',
      ] },
      { h: '5. Vos données', p: [
        'Toutes les données de portefeuille que vous saisissez sont stockées localement dans le `localStorage` de votre navigateur. Nous n’y avons pas accès. Il vous appartient exclusivement de conserver des sauvegardes au moyen de la fonction d’export de l’application. Effacer les données de votre navigateur, changer d’appareil ou désinstaller l’application supprimera définitivement vos données locales, sauf si vous avez exporté une sauvegarde.',
      ] },
      { h: '6. Utilisation acceptable', p: ['Vous vous engagez à ne pas :'], ul: [
        'Utiliser l’application à des fins illicites ou en violation d’une loi ou d’une réglementation applicable',
        'Tenter de faire de l’ingénierie inverse, de décompiler ou de désassembler tout ou partie de l’application',
        'Utiliser des outils automatisés pour extraire, surcharger ou détourner les API tierces auxquelles l’application accède',
        'Falsifier des données de portefeuille ou utiliser l’application pour faciliter une fraude financière',
      ] },
      { h: '7. Propriété intellectuelle', p: [
        'Le nom WalletLens, son logo, le design de son interface et son code original sont la propriété de WalletLens. Les logos de cryptomonnaies et les éléments de marque de tiers appartiennent à leurs propriétaires respectifs et sont utilisés à des fins d’identification, selon les principes de l’usage loyal.',
      ] },
      { h: '8. Services tiers', p: [
        'WalletLens s’appuie sur des services tiers pour les données de marché et la mesure d’audience (Google Analytics) et, pour les fonctionnalités facultatives listées dans la politique de confidentialité, pour l’envoi d’e-mails et le traitement par IA. Votre utilisation de l’application est également soumise aux conditions et politiques de confidentialité de ces tiers. Nous ne sommes pas responsables de leurs pratiques. WalletLens ne diffuse pas de publicité dans l’application.',
      ] },
      { h: '9. Exclusion de garanties', p: [
        'WalletLens est fourni « en l’état » et « selon disponibilité », sans garantie d’aucune sorte, expresse ou implicite. Nous ne garantissons pas que l’application sera ininterrompue, exempte d’erreurs ou de virus. Dans toute la mesure permise par la loi applicable, nous excluons toute garantie, y compris les garanties implicites de qualité marchande et d’adéquation à un usage particulier.',
      ] },
      { h: '10. Limitation de responsabilité', p: [
        'Dans toute la mesure permise par la loi, WalletLens et ses exploitants ne sauraient être tenus responsables de dommages indirects, accessoires, spéciaux, consécutifs ou punitifs, y compris, sans s’y limiter, la perte de bénéfices, de données ou de valeur d’investissement, résultant de votre utilisation ou de votre impossibilité d’utiliser l’application.',
      ] },
      { h: '11. Modifications du service', p: [
        'Nous nous réservons le droit de modifier, suspendre ou interrompre tout aspect de WalletLens à tout moment et sans préavis. Nous ne serons redevables ni envers vous ni envers un tiers du fait d’une modification, d’une suspension ou d’une interruption.',
      ] },
      { h: '12. Modifications de ces Conditions', p: [
        'Nous pouvons mettre à jour ces Conditions de temps à autre. Les modifications seront publiées sur cette page avec une date de dernière modification actualisée. Continuer à utiliser l’application après une modification vaut acceptation des Conditions révisées.',
      ] },
      { h: '13. Droit applicable', p: [
        'Ces Conditions sont régies et interprétées conformément au droit applicable. Tout litige né de ces Conditions ou de votre utilisation de l’application sera résolu par une négociation de bonne foi ou, si nécessaire, par un arbitrage exécutoire.',
      ] },
      { h: '14. Contact', p: [
        'Pour toute question relative à ces Conditions, écrivez-nous à [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },

  es: {
    title: 'Términos del servicio',
    updated: 'Última actualización: agosto de 2026',
    intro: 'Lee atentamente estos términos del servicio (los «Términos») antes de usar WalletLens («la aplicación», «nosotros»). Al acceder a WalletLens o usarlo, aceptas quedar vinculado por estos Términos.',
    sections: [
      { h: '1. Descripción del servicio', p: [
        'WalletLens es una aplicación gratuita de seguimiento de carteras que funciona en el navegador y permite registrar y controlar inversiones en varias clases de activos, como criptomonedas, acciones, materias primas y divisas. La aplicación se ejecuta íntegramente en tu navegador; ningún servidor almacena tus datos financieros.',
      ] },
      { h: '2. Requisitos de uso', p: [
        'Debes tener al menos 13 años para usar WalletLens. Al usar la aplicación, declaras que cumples este requisito de edad. Si eres menor de 18 años, conviene que revises estos Términos con un padre, madre o tutor.',
      ] },
      { h: '3. No constituye asesoramiento financiero', p: [
        'WalletLens es únicamente una herramienta informativa. Nada de lo que aparece en la plataforma constituye asesoramiento financiero, de inversión, jurídico ni fiscal. Todos los datos, análisis generados por IA, alertas de precio, puntuaciones de riesgo y análisis de cartera se ofrecen solo con fines informativos y no deben servir de base para tomar decisiones de inversión.',
        'Investiga siempre por tu cuenta y consulta a un asesor financiero cualificado antes de tomar cualquier decisión de inversión. Los indicadores de rentabilidad pasada que muestra la aplicación no garantizan resultados futuros.',
      ] },
      { h: '4. Exactitud de los datos', p: [
        'Los datos de precios proceden de API de terceros (CoinGecko, Binance, CoinCap, Gold-API, Stooq y otras). WalletLens no garantiza la exactitud, integridad, actualidad ni idoneidad para ningún fin de los precios o datos de mercado mostrados. No nos hacemos responsables de ninguna pérdida derivada de confiar en estos datos.',
      ] },
      { h: '5. Tus datos', p: [
        'Todos los datos de cartera que introduces se guardan localmente en el `localStorage` de tu navegador. No tenemos acceso a ellos. Eres el único responsable de mantener copias de seguridad mediante la función de exportación de la aplicación. Borrar los datos del navegador, usar un dispositivo nuevo o desinstalar la aplicación eliminará permanentemente tus datos locales salvo que hayas exportado una copia.',
      ] },
      { h: '6. Uso aceptable', p: ['Te comprometes a no:'], ul: [
        'Usar la aplicación con fines ilícitos o infringiendo cualquier ley o normativa aplicable',
        'Intentar aplicar ingeniería inversa, descompilar o desensamblar cualquier parte de la aplicación',
        'Usar herramientas automatizadas para extraer, sobrecargar o abusar de las API de terceros a las que accede la aplicación',
        'Falsear datos de cartera o usar la aplicación para facilitar un fraude financiero',
      ] },
      { h: '7. Propiedad intelectual', p: [
        'El nombre WalletLens, su logotipo, el diseño de la interfaz y el código original son propiedad de WalletLens. Los logotipos de criptomonedas y los elementos de marca de terceros pertenecen a sus respectivos propietarios y se usan con fines de identificación conforme a los principios de uso legítimo.',
      ] },
      { h: '8. Servicios de terceros', p: [
        'WalletLens se integra con servicios de terceros para los datos de precios de mercado y la analítica (Google Analytics) y, en el caso de las funciones opcionales enumeradas en la política de privacidad, para el envío de correo y el procesamiento con IA. Tu uso de la aplicación también está sujeto a los términos y las políticas de privacidad de esos terceros. No somos responsables de sus prácticas. WalletLens no muestra publicidad dentro de la aplicación.',
      ] },
      { h: '9. Exención de garantías', p: [
        'WalletLens se ofrece «tal cual» y «según disponibilidad», sin garantías de ningún tipo, expresas o implícitas. No garantizamos que la aplicación funcione sin interrupciones, sin errores ni libre de virus. En la máxima medida permitida por la ley aplicable, declinamos toda garantía, incluidas las garantías implícitas de comerciabilidad e idoneidad para un fin determinado.',
      ] },
      { h: '10. Limitación de responsabilidad', p: [
        'En la máxima medida permitida por la ley, WalletLens y sus operadores no serán responsables de daños indirectos, incidentales, especiales, consecuentes o punitivos, incluidos, entre otros, la pérdida de beneficios, de datos o de valor de la inversión, derivados del uso o de la imposibilidad de uso de la aplicación.',
      ] },
      { h: '11. Modificaciones del servicio', p: [
        'Nos reservamos el derecho de modificar, suspender o interrumpir cualquier aspecto de WalletLens en cualquier momento y sin previo aviso. No seremos responsables ante ti ni ante terceros por ninguna modificación, suspensión o interrupción.',
      ] },
      { h: '12. Cambios en estos Términos', p: [
        'Podemos actualizar estos Términos de vez en cuando. Los cambios se publicarán en esta página con una fecha de última modificación actualizada. Seguir usando la aplicación tras cualquier cambio supone aceptar los Términos revisados.',
      ] },
      { h: '13. Legislación aplicable', p: [
        'Estos Términos se rigen e interpretan conforme a la legislación aplicable. Cualquier controversia derivada de estos Términos o de tu uso de la aplicación se resolverá mediante negociación de buena fe o, si fuera necesario, mediante arbitraje vinculante.',
      ] },
      { h: '14. Contacto', p: [
        'Si tienes cualquier duda sobre estos Términos, escríbenos a [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },
}
