// Releasenotes voor het "Wat is er nieuw"-venster (WhatsNewModal.jsx).
//
// Nieuwste release bovenaan. `id` moet uniek en oplopend-op-datum zijn: de app
// onthoudt per gebruiker (localStorage, per apparaat) welke `id` het laatst is
// gezien en toont alles wat daarna kwam — één venster, nieuwste eerst, kruisje
// sluit en markeert alles als gezien. Wie ná een release een account maakte
// (auth created_at) krijgt die release niet: je hoeft niet te lezen wat er
// "gefixt" is aan iets wat je nooit anders hebt gekend.
//
// Per punt: kind = "new" | "improved" | "fix"; audience = wie het ziet
// ("owner", "staff"); text in nl/en/es. Kort houden — één regel per punt, in
// de taal van de gebruiker, zonder jargon. Nieuwe release? Voeg BOVENAAN toe
// met de datum van de deploy.

export const RELEASES = [
  {
    // Rapporten ook als Excel (Faisal 22-09-2026: "can all the pdf reports be
    // downloaded as excel files too?"). Zelfde cijfers als de PDF (één rekenlaag).
    id: "2026-09-22",
    date: "2026-09-22",
    title: { nl: "Excel-rapporten, wisselgeld en een kasboek", en: "Excel reports, change and a cash book", es: "Informes en Excel, cambio y libro de caja" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Kasboek in de Kassa, onder het dagoverzicht: zet aan het begin van de dag het beginsaldo (Vellu stelt de laatste telling voor), boek kas in en kas uit met een reden (wisselgeld gehaald, bloemen, naar de bank), en tel aan het eind de la. Contante verkopen tellen vanzelf mee. Je ziet wat er in de la hoort te zitten en na het tellen het kasverschil. Per dag terug te bladeren.",
          en: "Cash book in Sales, below the day overview: set the opening float at the start of the day (Vellu suggests the last count), log cash in and cash out with a reason (change from the bank, flowers, to the bank), and count the drawer at the end. Cash sales are included automatically. You see what should be in the drawer and, after counting, the difference. Browse back per day.",
          es: "Libro de caja en la Caja, debajo del resumen del día: fija el saldo inicial al empezar (Vellu sugiere el último recuento), registra entradas y salidas con un motivo (cambio del banco, flores, al banco) y cuenta la caja al final. Las ventas en efectivo se incluyen solas. Ves lo que debería haber en la caja y, tras contar, la diferencia. Se puede consultar por día.",
        },
      },
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Kassa, contant afrekenen: vul in wat de klant geeft (kassa in) en Vellu rekent het wisselgeld uit (kassa uit). Met snelknoppen voor gepast en de eerstvolgende ronde bedragen. Is het te weinig, dan zie je dat meteen en kun je niet afrekenen. Het wisselgeld staat groot in de bevestiging en op de bon. Niets invullen betekent gepast betaald.",
          en: "Sales, paying cash: enter what the client hands you (cash in) and Vellu works out the change (cash out). Quick buttons for the exact amount and the next round amounts. If it is too little you see it straight away and cannot check out. The change is shown large in the confirmation and on the receipt. Leaving it empty means paid exactly.",
          es: "Caja, pago en efectivo: introduce lo que te da el cliente (entra en caja) y Vellu calcula el cambio (sale de caja). Con botones rápidos para el importe exacto y los siguientes importes redondos. Si es poco lo ves al momento y no puedes cobrar. El cambio aparece en grande en la confirmación y en el recibo. Dejarlo vacío significa pago exacto.",
        },
      },
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Het omzetrapport (Facturen) en het verkooprapport van de Kassa kun je nu ook als Excel-bestand downloaden, naast de PDF. Bij Facturen staat een knop Download Excel naast Download PDF; in de Kassa kies je met de schakelaar PDF of Excel en tik je daarna op Dag, Maand, Kwartaal of Jaar. Het Excel-bestand bevat dezelfde cijfers als de PDF, met echte bedragen en datums om zelf mee te rekenen, te sorteren en te filteren: een samenvatting met de belasting per tarief, en per regel elke afspraak of verkoop.",
          en: "The revenue report (Invoices) and the sales report in the Sales tab can now be downloaded as an Excel file as well as a PDF. Under Invoices there is a Download Excel button next to Download PDF; in Sales you pick PDF or Excel with the switch and then tap Day, Month, Quarter or Year. The Excel file holds the same figures as the PDF, with real amounts and dates you can calculate with, sort and filter: a summary with tax per rate, and every appointment or sale as its own row.",
          es: "El informe de ingresos (Facturas) y el informe de ventas de la Caja ahora también se pueden descargar como archivo de Excel, además del PDF. En Facturas hay un botón Descargar Excel junto a Descargar PDF; en la Caja eliges PDF o Excel con el interruptor y luego tocas Día, Mes, Trimestre o Año. El archivo de Excel contiene las mismas cifras que el PDF, con importes y fechas reales para calcular, ordenar y filtrar: un resumen con el impuesto por tipo, y cada cita o venta en su propia fila.",
        },
      },
    ],
  },
  {
    // Schuifbalken in het hele dashboard + Kassa, Klanten en Facturen (alle drie
    // eerst 6) met Toon meer. Eigen id, zelfde reden als …b. Was kort …c (alleen
    // kassa), …d (klanten nog op 8) en …e (zonder facturen): telkens
    // samengevoegd, zodat wie vandaag nog niet keek één blok ziet, en de tekst
    // klopt met wat er nu staat.
    id: "2026-09-21f",
    date: "2026-09-21",
    title: { nl: "Schuifbalken in het hele dashboard", en: "Scroll bars across the dashboard", es: "Barras de desplazamiento en todo el panel" },
    items: [
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Op de computer heeft het hele dashboard nu schuifbalken waar iets schuift: rechts in beeld op lange pagina's zoals Facturen, Analytics en Instellingen, en in vensters en lijsten die langer zijn dan het scherm, zoals de klantkaart. Je kunt de balk slepen en hoeft niet meer alles met het muiswiel te doen. Op de telefoon verandert er niets: daar veeg je gewoon.",
          en: "On a computer the whole dashboard now has scroll bars wherever something scrolls: at the right of the screen on long pages such as Invoices, Analytics and Settings, and inside windows and lists that are taller than the screen, such as the client card. You can drag the bar instead of doing everything with the mouse wheel. Nothing changes on a phone: there you simply swipe.",
          es: "En el ordenador, todo el panel tiene ahora barras de desplazamiento donde algo se desplaza: a la derecha de la pantalla en páginas largas como Facturas, Analítica y Ajustes, y dentro de ventanas y listas más altas que la pantalla, como la ficha del cliente. Puedes arrastrar la barra en lugar de hacerlo todo con la rueda del ratón. En el móvil no cambia nada: ahí simplemente deslizas.",
        },
      },
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "Facturen: de lijst toont eerst 6 facturen, met Toon meer (25 erbij), Toon alles en Toon minder eronder. Voorheen waren het er 10 en daarna in één keer alles. Op de computer schuift de uitgeklapte lijst binnen een eigen vak met een schuifbalk. Zoeken en de tabbladen Alles, Open, Verstuurd en Verborgen werken zoals altijd.",
          en: "Invoices: the list shows 6 invoices first, with Show more (25 at a time), Show all and Show less below it. It used to be 10 and then everything at once. On a computer the expanded list scrolls inside its own box with a scroll bar. Search and the All, Open, Sent and Hidden tabs work as before.",
          es: "Facturas: la lista muestra primero 6 facturas, con Mostrar más (25 cada vez), Mostrar todo y Mostrar menos debajo. Antes eran 10 y luego todo de golpe. En el ordenador, la lista desplegada se desplaza dentro de su propio recuadro con una barra de desplazamiento. La búsqueda y las pestañas Todo, Abiertas, Enviadas y Ocultas funcionan como siempre.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Klanten: de lijst toont eerst 6 klanten, met Toon meer, Toon alles en Toon minder eronder. Op de computer schuift de uitgeklapte lijst binnen een eigen vak met een schuifbalk, zodat je niet meer eindeloos met het muiswiel hoeft te scrollen. Op de telefoon veeg je gewoon door. Zoeken op naam, e-mail of telefoon blijft het snelst, en een klant die je net toevoegt blijft in beeld.",
          en: "Clients: the list shows 6 clients first, with Show more, Show all and Show less below it. On a computer the expanded list scrolls inside its own box with a scroll bar, so no more endless scrolling with the mouse wheel. On a phone you simply swipe. Searching by name, email or phone stays the quickest way, and a client you just added stays in view.",
          es: "Clientes: la lista muestra primero 6 clientes, con Mostrar más, Mostrar todo y Mostrar menos debajo. En el ordenador, la lista desplegada se desplaza dentro de su propio recuadro con una barra de desplazamiento, así que se acabó girar la rueda del ratón sin fin. En el móvil simplemente deslizas. Buscar por nombre, correo o teléfono sigue siendo lo más rápido, y un cliente que acabas de añadir queda a la vista.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Kassa: het productraster toont eerst 6 producten, met Toon meer, Toon alles en Toon minder eronder. Klap je het uit, dan schuift het raster binnen een eigen vak met een schuifbalk. Kadobon, dagoverzicht, rapporten en het afrekenen blijven daardoor in beeld, ook met een lange productlijst. Zoeken of scannen blijft het snelst, en wat al in de bon zit blijft altijd zichtbaar. Hetzelfde geldt voor het venster Product verkopen bij een afspraak.",
          en: "Sales: the product grid shows 6 products first, with Show more, Show all and Show less below it. Once expanded, the grid scrolls inside its own box with a scroll bar. Gift card, daily overview, reports and the checkout stay in view, even with a long product list. Searching or scanning stays the quickest way, and whatever is already in the basket always stays visible. The same goes for the Sell a product window on an appointment.",
          es: "Caja: la cuadrícula muestra primero 6 productos, con Mostrar más, Mostrar todo y Mostrar menos debajo. Al desplegarla, la cuadrícula se desplaza dentro de su propio recuadro con una barra de desplazamiento. Así la tarjeta regalo, el resumen del día, los informes y el cobro siguen a la vista, también con una lista larga. Buscar o escanear sigue siendo lo más rápido, y lo que ya está en el tique siempre queda visible. Lo mismo vale para la ventana Vender un producto de una cita.",
        },
      },
    ],
  },
  {
    // Oogje bovenaan de productenlijst. Eigen id (…b): het blok van eerder
    // vandaag is door de meeste salons al gezien, en gezien = per id.
    id: "2026-09-21b",
    date: "2026-09-21",
    title: { nl: "Alle producten in één keer alleen aan de balie", en: "All products counter only in one go", es: "Todos los productos solo en el mostrador de una vez" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Instellingen → Diensten & producten: met het oogje bovenaan de productenlijst zet je alle producten in één keer op alleen aan de balie. Ze verdwijnen dan van je boekingspagina, maar blijven gewoon in je kassa staan. Nog een keer tikken zet ze weer online. Zoek je eerst, bijvoorbeeld op een leverancier, dan geldt het alleen voor de gevonden producten. Per product kan het nog steeds met het oogje in de rij.",
          en: "Settings → Services & products: the eye at the top of the product list sets all products to counter only in one go. They disappear from your booking page but stay in your till. Tap it again to put them back online. Search first, for example by supplier, and it only applies to the products found. Per product it still works with the eye in the row.",
          es: "Ajustes → Servicios y productos: con el ojo de arriba de la lista de productos pones todos los productos como solo de mostrador de una vez. Desaparecen de tu página de reservas, pero siguen en tu caja. Tócalo otra vez para volver a mostrarlos online. Si buscas primero, por ejemplo por proveedor, solo se aplica a los productos encontrados. Por producto sigue funcionando con el ojo de la fila.",
        },
      },
    ],
  },
  {
    // Referral-actie 21-09 t/m 05-10-2026 (referral_promos). Na de einddatum
    // mag dit blok blijven staan: het noemt de datum zelf.
    id: "2026-09-21",
    date: "2026-09-21",
    title: { nl: "Actie: 1 maand gratis voor jullie allebei", en: "Offer: 1 month free for both of you", es: "Promoción: 1 mes gratis para las dos" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Tot en met 5 oktober: meldt iemand zich aan met jouw uitnodigingscode, dan krijgen jullie allebei 1 maand Vellu gratis in plaats van 2 weken. Jij krijgt de maand als tegoed, verrekend bij je volgende afschrijving; de nieuwe salon begint met 1 maand gratis in plaats van 2 weken. Zo vaak als je iemand uitnodigt. Bovenaan je dashboard staat een kaart met een WhatsApp-knop en een kant-en-klaar bericht.",
          en: "Until 5 October: if someone signs up using your referral code, you both get 1 month of Vellu free instead of 2 weeks. You get the month as credit, settled at your next payment; the new salon starts with 1 month free instead of 2 weeks. As often as you invite someone. At the top of your dashboard there is a card with a WhatsApp button and a ready-made message.",
          es: "Hasta el 5 de octubre: si alguien se registra con tu código de invitación, ambos recibís 1 mes de Vellu gratis en lugar de 2 semanas. Tú recibes el mes como crédito, que se descuenta en tu próximo cobro; el nuevo salón empieza con 1 mes gratis en lugar de 2 semanas. Tantas veces como invites a alguien. Arriba en tu panel hay una tarjeta con un botón de WhatsApp y un mensaje ya preparado.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Instellingen → Diensten & producten: de productenlijst toont eerst 5 producten, met Toon meer, Toon alles en Toon minder eronder. Zoeken blijft het snelst bij een lange lijst. De kopjes Inkoop, Verkoop en Voorraad staan nu recht boven hun kolom.",
          en: "Settings → Services & products: the product list shows 5 products first, with Show more, Show all and Show less below it. Searching stays the quickest way in a long list. The Cost, Sale and Stock headings now sit right above their columns.",
          es: "Ajustes → Servicios y productos: la lista de productos muestra primero 5, con Mostrar más, Mostrar todo y Mostrar menos debajo. Buscar sigue siendo lo más rápido en una lista larga. Los títulos Compra, Venta y Existencias están ahora justo encima de su columna.",
        },
      },
    ],
  },
  {
    id: "2026-09-17",
    date: "2026-09-17",
    title: { nl: "Boekingspagina opent bovenaan", en: "Booking page opens at the top", es: "La página de reservas se abre arriba" },
    items: [
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Agenda, dagweergave: een geblokkeerde dag of geblokkeerde uren zijn nu een duidelijk grijs gearceerd vlak in plaats van bijna doorzichtig. Afspraken die er al stonden blijven er gewoon leesbaar bovenop staan.",
          en: "Calendar, day view: a blocked day or blocked hours are now a clear grey hatched area instead of almost transparent. Appointments that were already there stay readable on top of it.",
          es: "Agenda, vista de día: un día bloqueado o unas horas bloqueadas son ahora una zona gris rayada bien visible, en lugar de casi transparente. Las citas que ya estaban siguen leyéndose bien encima.",
        },
      },
      {
        kind: "fix", audience: ["owner"],
        text: {
          nl: "Afspraak verplaatsen op de iPhone: het veld Nieuwe tijd stak rechts uit het venster. Het is nu even breed als het datumveld.",
          en: "Reschedule appointment on iPhone: the New time field stuck out of the window on the right. It is now the same width as the date field.",
          es: "Reprogramar cita en iPhone: el campo Nueva hora se salía de la ventana por la derecha. Ahora tiene el mismo ancho que el campo de fecha.",
        },
      },
      {
        kind: "fix", audience: ["owner"],
        text: {
          nl: "Wie je boekingspagina opende via de Vellu-homepage (Vind een salon) kwam op de iPhone halverwege de pagina uit, bij de behandelingen. De pagina opent nu altijd bovenaan, bij je omslagfoto en naam.",
          en: "Anyone opening your booking page through the Vellu homepage (Find a salon) landed halfway down the page on iPhone, at the treatments. The page now always opens at the top, at your cover photo and name.",
          es: "Quien abría tu página de reservas desde la página de inicio de Vellu (Buscar un salón) aparecía en el iPhone a mitad de página, en los tratamientos. Ahora la página se abre siempre arriba, en tu foto de portada y tu nombre.",
        },
      },
      {
        kind: "fix", audience: ["owner"],
        text: {
          nl: "Android-telefoons met de donkere modus aan (Samsung Internet, Chrome) maakten een lichte boekingspagina zelf donker en verkleurden je salonkleur, bijvoorbeeld lichtroze naar donkerpaars. Je pagina blijft nu precies zoals jij hem instelde: licht blijft licht, met je eigen kleur.",
          en: "Android phones with dark mode on (Samsung Internet, Chrome) darkened a light booking page by themselves and changed your salon colour, for example light pink into dark purple. Your page now stays exactly as you set it: light stays light, with your own colour.",
          es: "Los móviles Android con el modo oscuro activado (Samsung Internet, Chrome) oscurecían por su cuenta una página de reservas clara y cambiaban el color de tu salón, por ejemplo de rosa claro a morado oscuro. Ahora tu página se queda exactamente como la configuraste: clara, con tu propio color.",
        },
      },
    ],
  },
  {
    // Vijfde blok op 16-09 (notities per bezoek), zelfde achtervoegsel-truc.
    id: "2026-09-16e",
    date: "2026-09-16",
    title: { nl: "Notities per bezoek", en: "Notes per visit", es: "Notas por visita" },
    items: [
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Op elke afspraakkaart staat nu een notitieblok tussen de allergie-regel en de knoppen. Tab Notitie: schrijf op wat je de klant hebt meegegeven, bijvoorbeeld elke dag nagelriemolie of over drie weken terugkomen.",
          en: "Every appointment card now has a notes block between the allergy line and the buttons. Tab Note: write down what you advised the client, for example cuticle oil every day or come back in three weeks.",
          es: "Cada tarjeta de cita tiene ahora un bloque de notas entre la línea de alergias y los botones. Pestaña Nota: apunta lo que le aconsejaste al cliente, por ejemplo aceite de cutículas a diario o volver en tres semanas.",
        },
      },
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Komt de klant terug, dan opent het blok op de tab Vorige keer met wat je toen schreef en de vraag Gedaan? met Ja of Nee. Zo weet je bij binnenkomst wat je hebt geadviseerd en of ze het heeft opgevolgd. Medewerkers zien de notities van hun eigen afspraken.",
          en: "When the client returns, the block opens on the Last time tab with what you wrote then and the question Done? with Yes or No. So when she walks in you know what you advised and whether she followed it. Team members see the notes of their own appointments.",
          es: "Cuando el cliente vuelve, el bloque se abre en la pestaña La última vez con lo que escribiste entonces y la pregunta ¿Lo hizo? con Sí o No. Así sabes al entrar qué le aconsejaste y si lo siguió. El equipo ve las notas de sus propias citas.",
        },
      },
      {
        kind: "fix", audience: ["owner"],
        text: {
          nl: "Wachtlijst: aanmeldingen voor een dag die al voorbij is verdwijnen nu vanzelf. Je hoeft ze niet meer zelf weg te halen.",
          en: "Waitlist: sign-ups for a day that has already passed now disappear by themselves. You no longer have to remove them yourself.",
          es: "Lista de espera: las inscripciones para un día que ya pasó desaparecen solas. Ya no tienes que quitarlas tú.",
        },
      },
    ],
  },
  {
    // Vierde blok op 16-09 (dagweergave), zelfde achtervoegsel-truc.
    id: "2026-09-16d",
    date: "2026-09-16",
    title: { nl: "Dagweergave vernieuwd", en: "Day view redesigned", es: "Vista de día renovada" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Agenda, dagweergave: één datumregel met het aantal afspraken en de verwachte omzet, daaronder een weekstrook om snel een dag te kiezen (stipje = afspraken) en drie knoppen: Afspraak, Blokkeer tijd, Blokkeer behandeling. Op de telefoon én op de computer.",
          en: "Calendar, day view: one date line with the number of appointments and the expected revenue, below it a week strip to pick a day quickly (dot = appointments) and three buttons: Appointment, Block time, Block treatment. On the phone and on the computer.",
          es: "Agenda, vista de día: una línea de fecha con el número de citas y los ingresos previstos, debajo una tira semanal para elegir un día rápidamente (punto = citas) y tres botones: Cita, Bloquear hora, Bloquear tratamiento. En el móvil y en el ordenador.",
        },
      },
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Tijdlijn: elke afspraak toont de prijs, vrije gaten van minstens een half uur staan gestippeld met de tijd erin en openen met één tik een nieuwe afspraak op dat tijdstip, pauzes en blokkades zijn grijs gearceerd, en de nu-lijn staat in je eigen kleur met de tijd erbij.",
          en: "Timeline: every appointment shows the price, free gaps of at least half an hour appear dotted with the time in them and open a new appointment at that time with one tap, breaks and blocks are hatched grey, and the now line is in your own colour with the time next to it.",
          es: "Línea de tiempo: cada cita muestra el precio, los huecos libres de al menos media hora aparecen punteados con la hora y abren una nueva cita a esa hora con un toque, las pausas y bloqueos van rayados en gris, y la línea de ahora está en tu color con la hora al lado.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Tik op een afspraak in de tijdlijn en er opent een paneel met de volledige afspraakkaart en al haar knoppen (Markeer voltooid, Verplaats, Bewerk, No-show, Annuleer, agenda, WhatsApp). De lange lijst met kaarten onder de tijdlijn staat ingeklapt achter Lijst met alle knoppen.",
          en: "Tap an appointment in the timeline and a panel opens with the full appointment card and all its buttons (Mark complete, Reschedule, Edit, No-show, Cancel, calendar, WhatsApp). The long list of cards under the timeline is collapsed behind List with all buttons.",
          es: "Toca una cita en la línea de tiempo y se abre un panel con la tarjeta completa y todos sus botones (Completar, Reprogramar, Editar, No-show, Cancelar, calendario, WhatsApp). La larga lista de tarjetas bajo la línea de tiempo queda plegada tras Lista con todos los botones.",
        },
      },
    ],
  },
  {
    // Derde blok op 16-09 (medewerkersapp), zelfde achtervoegsel-truc.
    id: "2026-09-16c",
    date: "2026-09-16",
    title: { nl: "Nieuwe look medewerkersapp", en: "New look for the team app", es: "Nuevo aspecto de la app del equipo" },
    items: [
      {
        kind: "new", audience: ["staff"],
        text: {
          nl: "Je app heeft dezelfde stijl gekregen als de website en de boekingspagina: zwevende kaarten met zachte vierkante hoeken. Bovenaan tegels voor deze week, deze maand en je totaal, daaronder Vandaag met je afspraken naast Snelle acties (afspraak toevoegen, boekingspagina bekijken of de link kopiëren, agenda exporteren, telefoon-agenda koppelen) en je populairste behandelingen, met de omzetgrafiek eronder.",
          en: "Your app now has the same style as the website and the booking page: floating cards with soft square corners. At the top tiles for this week, this month and your total, below that Today with your appointments next to Quick actions (add appointment, view or copy the booking link, export calendar, link phone calendar) and your most popular services, with the revenue chart below.",
          es: "Tu app tiene ahora el mismo estilo que la web y la página de reservas: tarjetas flotantes con esquinas cuadradas suaves. Arriba mosaicos de esta semana, este mes y tu total, debajo Hoy con tus citas junto a Acciones rápidas (añadir cita, ver o copiar el enlace de reservas, exportar calendario, vincular calendario del móvil) y tus tratamientos más populares, con el gráfico de ingresos debajo.",
        },
      },
      {
        kind: "improved", audience: ["staff"],
        text: {
          nl: "Zijbalk: bovenaan een kaart met je naam, salon en rol en de boekingslink met een oog (bekijken) en een schakel (kopiëren). Bovenaan de pagina staat op Dashboard en Agenda één knop + Afspraak toevoegen.",
          en: "Sidebar: a card at the top with your name, salon and role, and the booking link with an eye (view) and a link icon (copy). The top of the page has one + Add appointment button on Dashboard and Calendar.",
          es: "Barra lateral: arriba una tarjeta con tu nombre, salón y rol, y el enlace de reservas con un ojo (ver) y un icono de enlace (copiar). Arriba de la página hay un botón + Agregar cita en Panel y Agenda.",
        },
      },
      {
        kind: "improved", audience: ["staff"],
        text: {
          nl: "Afspraakkaart: één rij knoppen (Voltooid in de salonkleur, Prijs, No-show, Annuleer) met rechts eronder kleine icoontjes voor Google Agenda en WhatsApp. Op de telefoon staat Voltooid op volle breedte met de andere drie in één rij eronder.",
          en: "Appointment card: one row of buttons (Complete in the salon colour, Price, No-show, Cancel) with small icons below right for Google Calendar and WhatsApp. On phones Complete spans the full width with the other three in one row below.",
          es: "Tarjeta de cita: una fila de botones (Completar en el color del salón, Precio, No-show, Cancelar) con pequeños iconos abajo a la derecha para Google Calendar y WhatsApp. En el móvil Completar ocupa todo el ancho con los otros tres en una fila debajo.",
        },
      },
      {
        kind: "improved", audience: ["staff"],
        text: {
          nl: "Agenda, Klanten, Facturen en Instellingen in dezelfde stijl: rustige grijze knoppen voor Blokkeer tijd, Blokkeer behandeling en Extra werkdag (op de telefoon drie gelijke knoppen met de weeknavigatie eronder), weekrooster en periodestrook als kaart, klanten en facturen als zwevende rijen met een vierkante initiaal, tegels met een icoon.",
          en: "Calendar, Clients, Invoices and Settings in the same style: calm grey buttons for Block time, Block treatment and Extra workday (on phones three equal buttons with the week navigation below), week grid and period strip as cards, clients and invoices as floating rows with a square initial, tiles with an icon.",
          es: "Agenda, Clientes, Facturas y Ajustes en el mismo estilo: botones grises tranquilos para Bloquear tiempo, Bloquear tratamiento y Día extra (en el móvil tres botones iguales con la navegación semanal debajo), cuadrícula semanal y franja de periodo como tarjetas, clientes y facturas como filas flotantes con una inicial cuadrada, mosaicos con icono.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "De app van je medewerkers heeft nu dezelfde nieuwe look als jouw dashboard: tegels, Vandaag naast snelle acties, dezelfde afspraakkaart en agenda.",
          en: "Your team members' app now has the same new look as your dashboard: tiles, Today next to quick actions, the same appointment card and calendar.",
          es: "La app de tu equipo tiene ahora el mismo aspecto nuevo que tu panel: mosaicos, Hoy junto a acciones rápidas, la misma tarjeta de cita y agenda.",
        },
      },
    ],
  },
  {
    // Tweede release op dezelfde dag: id met achtervoegsel zodat wie
    // "2026-09-16" al zag dit blok nog wél krijgt (string-vergelijking).
    id: "2026-09-16b",
    date: "2026-09-16",
    title: { nl: "Nieuwe look dashboard", en: "New dashboard look", es: "Nuevo aspecto del panel" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Je dashboard heeft dezelfde stijl gekregen als de website en je boekingspagina: zwevende kaarten met zachte vierkante hoeken. Bovenaan vier tegels (deze week, deze maand, dit jaar en je beoordeling), daaronder Vandaag met je afspraken naast Snelle acties als tegels en je populairste behandelingen, en de omzetgrafiek over de volle breedte.",
          en: "Your dashboard now has the same style as the website and your booking page: floating cards with soft square corners. At the top four tiles (this week, this month, this year and your rating), below that Today with your appointments next to Quick actions as tiles and your most popular services, and the revenue chart across the full width.",
          es: "Tu panel tiene ahora el mismo estilo que la web y tu página de reservas: tarjetas flotantes con esquinas cuadradas suaves. Arriba cuatro mosaicos (esta semana, este mes, este año y tu valoración), debajo Hoy con tus citas junto a Acciones rápidas como mosaicos y tus tratamientos más populares, y el gráfico de ingresos a todo el ancho.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Zijbalk: je salon staat bovenaan als kaart met logo, plaats en plan, met je boekingslink eronder. Het oog opent je pagina, de schakel kopieert de link. De knoppen Preview en Kopieer bovenaan de pagina zijn daarheen verhuisd; bovenaan staat nu alleen nog + Afspraak toevoegen.",
          en: "Sidebar: your salon sits at the top as a card with logo, city and plan, with your booking link below it. The eye opens your page, the link icon copies the link. The Preview and Copy buttons at the top of the page moved there; the top now only has + Add appointment.",
          es: "Barra lateral: tu salón aparece arriba como tarjeta con logo, ciudad y plan, con tu enlace de reservas debajo. El ojo abre tu página, el icono de enlace copia el enlace. Los botones Vista previa y Copiar de la parte superior se han movido allí; arriba solo queda + Agregar cita.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Afspraakkaart: op de computer één rij knoppen (Markeer voltooid in je kleur, Verplaats, Bewerk, No-show, Annuleer) met rechts eronder kleine vierkante icoontjes voor Google Agenda, WhatsApp, product verkopen en verwijderen. Op de telefoon staat Markeer voltooid op volle breedte met de vier knoppen in twee rijen eronder.",
          en: "Appointment card: on desktop one row of buttons (Mark complete in your colour, Reschedule, Edit, No-show, Cancel) with small square icons below right for Google Calendar, WhatsApp, selling a product and delete. On phones Mark complete spans the full width with the four buttons in two rows below.",
          es: "Tarjeta de cita: en el ordenador una fila de botones (Completar en tu color, Reprogramar, Editar, No-show, Cancelar) con pequeños iconos cuadrados abajo a la derecha para Google Calendar, WhatsApp, vender un producto y eliminar. En el móvil Completar ocupa todo el ancho con los cuatro botones en dos filas debajo.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Telefoon: de balk onderaan heeft hoogstens vijf knoppen: Dashboard, Agenda, Kassa (Professional), Klanten en Meer. Analytics, Facturen en Instellingen vind je onder Meer.",
          en: "Phone: the bottom bar has at most five buttons: Dashboard, Calendar, Sales (Professional), Clients and More. Analytics, Invoices and Settings are under More.",
          es: "Móvil: la barra inferior tiene como máximo cinco botones: Panel, Agenda, Caja (Professional), Clientes y Más. Analítica, Facturas y Ajustes están bajo Más.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Agenda, Verkoop, Klanten, Analytics en Facturen in dezelfde stijl: Blokkeer tijd en Blokkeer behandeling zijn rustige grijze knoppen in plaats van rood, het weekrooster en de periodestrook zijn kaarten, klanten en facturen staan als zwevende rijen met een vierkante initiaal, en Facturen en Analytics openen met tegels met een icoon.",
          en: "Calendar, Sales, Clients, Analytics and Invoices in the same style: Block time and Block treatment are calm grey buttons instead of red, the week grid and period strip are cards, clients and invoices are floating rows with a square initial, and Invoices and Analytics open with icon tiles.",
          es: "Agenda, Ventas, Clientes, Analítica y Facturas en el mismo estilo: Bloquear tiempo y Bloquear tratamiento son botones grises tranquilos en lugar de rojos, la cuadrícula semanal y la franja de periodo son tarjetas, clientes y facturas son filas flotantes con una inicial cuadrada, y Facturas y Analítica abren con mosaicos con icono.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Kassa: de vier rapportknoppen staan onder één kopje Verkooprapport (PDF) als Dag, Maand, Kwartaal en Jaar, even breed op één rij.",
          en: "Sales: the four report buttons now sit under one heading Sales report (PDF) as Day, Month, Quarter and Year, equal width on one row.",
          es: "Caja: los cuatro botones de informe están bajo un solo título Informe de ventas (PDF) como Día, Mes, Trimestre y Año, del mismo ancho en una fila.",
        },
      },
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Stempelkaart per teamlid: op de klantkaart staat nu bij elk teamlid een eigen schakelaar. Zet je die uit, dan tellen bezoeken bij dat teamlid niet mee en krijgt de klant daar geen code voor; bij de anderen spaart ze gewoon door.",
          en: "Loyalty card per team member: the client card now has a switch next to each team member. Turn it off and visits with that team member no longer count and no code is issued for them; with the others the client keeps collecting.",
          es: "Tarjeta de fidelidad por miembro del equipo: la ficha del cliente tiene ahora un interruptor junto a cada miembro. Si lo desactivas, las visitas con esa persona no cuentan y no se emite código; con los demás sigue acumulando.",
        },
      },
      {
        kind: "improved", audience: ["staff"],
        text: {
          nl: "Ook in jouw app hebben kaarten en afspraken nu dezelfde zachte vierkante hoeken en zwevende schaduw als de website en de boekingspagina.",
          en: "In your app too, cards and appointments now have the same soft square corners and floating shadow as the website and the booking page.",
          es: "También en tu app, las tarjetas y las citas tienen ahora las mismas esquinas cuadradas suaves y sombra flotante que la web y la página de reservas.",
        },
      },
    ],
  },
  {
    id: "2026-09-16",
    date: "2026-09-16",
    title: { nl: "No-show-vergoeding", en: "No-show fee", es: "Tarifa por ausencia" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Instellingen, naast de no-show-blokkade: zet een no-show-vergoeding aan van 10, 20, 25, 50 of 100% van het afspraakbedrag. Bij het aanzetten vragen we of we de zin in je boekingsbeleid mogen zetten, want zonder die zin kun je niets rekenen. Klanten zien het percentage bij het boeken, vlak voor ze akkoord gaan met je beleid.",
          en: "Settings, next to the no-show block: turn on a no-show fee of 10, 20, 25, 50 or 100% of the appointment price. When you turn it on we ask whether we may add the sentence to your booking policy, because without it you cannot charge anything. Clients see the percentage when booking, right before they accept your policy.",
          es: "Ajustes, junto al bloqueo por ausencia: activa una tarifa por ausencia del 10, 20, 25, 50 o 100% del importe de la cita. Al activarla te preguntamos si podemos añadir la frase a tu política de reservas, porque sin ella no puedes cobrar nada. Los clientes ven el porcentaje al reservar, justo antes de aceptar tu política.",
        },
      },
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Markeer je een afspraak als no-show, dan staat het vergoedingsbedrag op de afspraakkaart, in de app van de eigenaar met een WhatsApp-betaalverzoek. Vellu int niets zelf.",
          en: "When you mark an appointment as a no-show, the fee amount appears on the appointment card, in the owner app with a WhatsApp payment request. Vellu does not collect anything itself.",
          es: "Si marcas una cita como ausencia, el importe de la tarifa aparece en la tarjeta de la cita, en la app del propietario con una solicitud de pago por WhatsApp. Vellu no cobra nada por sí mismo.",
        },
      },
    ],
  },
  {
    id: "2026-09-15",
    date: "2026-09-15",
    title: { nl: "Vierkante knoppen", en: "Square buttons", es: "Botones cuadrados" },
    items: [
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "Knoppen, filters en labels hebben nu zachte vierkante hoeken in plaats van pilvormen, in de app én op je boekingspagina, in dezelfde stijl als de Vellu-website. Schakelaars en ronde iconen blijven rond.",
          en: "Buttons, filters and labels now have soft square corners instead of pill shapes, in the app and on your booking page, in the same style as the Vellu website. Switches and round icons stay round.",
          es: "Los botones, filtros y etiquetas tienen ahora esquinas cuadradas suaves en lugar de forma de píldora, en la app y en tu página de reservas, en el mismo estilo que la web de Vellu. Los interruptores y los iconos redondos siguen redondos.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Afspraakkaart: de knoppen staan in vaste rijen — Afronden op volle breedte, daaronder Verplaats, Bewerk, No-show en Annuleer even groot, en onderaan Google Agenda, WhatsApp en de kleine icoontjes op één rij.",
          en: "Appointment card: the buttons now sit in fixed rows — Mark complete full width, then Reschedule, Edit, No-show and Cancel at equal size, and Google Calendar, WhatsApp and the small icons on one row at the bottom.",
          es: "Tarjeta de cita: los botones están ahora en filas fijas — Completar a todo el ancho, debajo Reprogramar, Editar, No-show y Cancelar del mismo tamaño, y abajo Google Calendar, WhatsApp y los iconos pequeños en una sola fila.",
        },
      },
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Je boekingspagina heeft een nieuwe look: een Boek-knop bovenin naast Delen met de eerstvolgende beschikbare dag, je logo over de rand van je foto, diensten als kaarten met foto of icoon, teamkaarten met een Boek-knop per medewerker, een fotoraster, reviewkaarten, en openingstijden van de hele week naast je contactgegevens. Op de telefoon staat onderaan een vaste balk met het eerstvolgende slot en Boek. Alles in je eigen kleur en licht/donker-keuze.",
          en: "Your booking page has a new look: a Book button at the top next to Share with the next available day, your logo over the edge of your photo, services as cards with a photo or icon, team cards with a Book button per team member, a photo grid, review cards, and the full week of opening hours next to your contact details. On phones a fixed bar at the bottom shows the next slot and Book. All in your own colour and light/dark choice.",
          es: "Tu página de reservas tiene un nuevo aspecto: un botón Reservar arriba junto a Compartir con el próximo día disponible, tu logo sobre el borde de tu foto, servicios como tarjetas con foto o icono, tarjetas de equipo con un botón Reservar por persona, una cuadrícula de fotos, tarjetas de reseñas y el horario de toda la semana junto a tus datos de contacto. En el móvil, una barra fija abajo muestra el próximo hueco y Reservar. Todo en tu propio color y modo claro/oscuro.",
        },
      },
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Boeken zelf is ook vernieuwd: bovenaan de datumkeuze staat een kaart met de eerstvolgende vrije tijd (één tik kiest dag én tijd), diensten, tijden en het overzicht zijn kaarten in dezelfde stijl, en het bevestigingsscherm toont wanneer, wat, waar en het bedrag, met knoppen voor je agenda, WhatsApp en de route.",
          en: "Booking itself is refreshed too: the date step opens with a card showing the next free time (one tap picks day and time), services, times and the overview are cards in the same style, and the confirmation screen shows when, what, where and the amount, with buttons for your calendar, WhatsApp and directions.",
          es: "Reservar también se ha renovado: el paso de fecha empieza con una tarjeta con la próxima hora libre (un toque elige día y hora), los servicios, horas y el resumen son tarjetas del mismo estilo, y la pantalla de confirmación muestra cuándo, qué, dónde y el importe, con botones para tu calendario, WhatsApp y cómo llegar.",
        },
      },
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "Categorieknoppen boven je diensten: de pijlen links en rechts staan er alleen nog als niet alle categorieën op één rij passen. Op de boekingspagina én in de boekflow.",
          en: "Category buttons above your services: the left and right arrows only appear when not all categories fit on one row. On the booking page and in the booking flow.",
          es: "Botones de categoría sobre tus servicios: las flechas izquierda y derecha solo aparecen cuando no caben todas las categorías en una fila. En la página de reservas y en el flujo de reserva.",
        },
      },
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "Teamkaart: past de bio niet in drie regels, dan staat er Lees meer. Dat opent een venster met de hele tekst, alle diensten van die medewerker en een Boek-knop. De kaarten blijven even hoog.",
          en: "Team card: if the bio does not fit in three lines, a Read more link appears. It opens a window with the full text, all of that team member's services and a Book button. The cards stay the same height.",
          es: "Tarjeta de equipo: si la bio no cabe en tres líneas, aparece Leer más. Abre una ventana con el texto completo, todos los servicios de esa persona y un botón Reservar. Las tarjetas mantienen la misma altura.",
        },
      },
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "De pagina's Privacy, Voorwaarden, Contact, Verwerkersovereenkomst en Google Agenda-integratie staan nu in dezelfde stijl als de website. Onderaan de homepage verdwijnt de zwevende proefknop zodra de grote knop in beeld is, en de voetregels staan vrij van de chat-knop.",
          en: "The Privacy, Terms, Contact, Data Processing Agreement and Google Calendar integration pages now share the website's style. At the bottom of the homepage the floating trial button disappears once the big button is in view, and the footer lines stay clear of the chat button.",
          es: "Las páginas de Privacidad, Términos, Contacto, Acuerdo de tratamiento e integración con Google Calendar tienen ahora el mismo estilo que la web. Al final de la página de inicio, el botón flotante de prueba desaparece cuando el botón grande está a la vista, y las líneas del pie quedan libres del botón de chat.",
        },
      },
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "De cookiemelding volgt nu de nieuwe stijl: op je boekingspagina neutraal in jouw licht- of donkerthema (geen Vellu-goud meer) en op de telefoon boven de Boek-balk.",
          en: "The cookie notice now follows the new style: on your booking page it is neutral in your light or dark theme (no more Vellu gold) and on phones it sits above the Book bar.",
          es: "El aviso de cookies sigue ahora el nuevo estilo: en tu página de reservas es neutro en tu tema claro u oscuro (sin el dorado de Vellu) y en el móvil queda encima de la barra Reservar.",
        },
      },
      {
        kind: "fix", audience: ["owner", "staff"],
        text: {
          nl: "Deel-knop op je boekingspagina: het deel-icoon is nu ook zichtbaar als je huisstijlkleur wit of heel licht is.",
          en: "Share button on your booking page: the share icon is now visible even when your brand colour is white or very light.",
          es: "Botón Compartir en tu página de reservas: el icono ahora también se ve cuando tu color de marca es blanco o muy claro.",
        },
      },
      {
        kind: "fix", audience: ["owner", "staff"],
        text: {
          nl: "Teamkaart: laadt een teamfoto niet, dan staat er een persoon-icoon in je kleur in plaats van het kapotte plaatje van de browser.",
          en: "Team card: if a team photo fails to load, a person icon in your colour is shown instead of the browser's broken-image glyph.",
          es: "Tarjeta de equipo: si una foto del equipo no carga, se muestra un icono de persona en tu color en lugar del símbolo de imagen rota del navegador.",
        },
      },
      {
        kind: "improved", audience: ["owner"],
        text: {
          nl: "Snelle acties op het dashboard: alle knoppen even groot met het label op één regel; op een smaller scherm netjes verdeeld over twee of drie rijen.",
          en: "Quick actions on the dashboard: all buttons the same size with the label on one line; on a narrower screen neatly split over two or three rows.",
          es: "Acciones rápidas en el panel: todos los botones del mismo tamaño con la etiqueta en una sola línea; en una pantalla más estrecha, repartidos en dos o tres filas.",
        },
      },
    ],
  },
  {
    id: "2026-09-09",
    date: "2026-09-09",
    title: { nl: "Prijs per behandeling bij een gedeelde boeking", en: "Price per treatment in a shared booking", es: "Precio por tratamiento en una reserva compartida" },
    items: [
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Boekt een klant twee behandelingen bij twee stylistes, dan staat op de kaart nu per behandeling de tijd, de stylist én de eigen prijs. Met het medewerkerfilter zie je haar bedrag groot en het totaal klein. De factuur blijft één factuur, maar toont elke behandeling met stylist en prijs en dan het totaal; medewerkers factureren vanuit hun eigen app alleen hun deel.",
          en: "When a client books two treatments with two stylists, the card now shows each treatment's time, stylist and own price. With the team-member filter you see her amount large and the total small. The invoice stays one invoice but lists each treatment with stylist and price, then the total; team members invoice only their part from their own app.",
          es: "Si un cliente reserva dos tratamientos con dos estilistas, la tarjeta muestra ahora por tratamiento la hora, la estilista y su propio precio. Con el filtro de equipo ves su importe en grande y el total en pequeño. La factura sigue siendo una, pero muestra cada tratamiento con estilista y precio y luego el total; las trabajadoras facturan solo su parte desde su propia app.",
        },
      },
    ],
  },
  {
    id: "2026-09-08",
    date: "2026-09-08",
    title: { nl: "Stempelkaart voor gekozen klanten", en: "Loyalty card for chosen clients", es: "Tarjeta de fidelidad para clientes elegidos" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Licht of donker: kies bij Instellingen → Salon → Stijl waarin je boekingspagina opent (Licht, Donker of Apparaat volgen). Tot nu toe opende de pagina altijd donker.",
          en: "Light or dark: under Settings → Salon → Style choose how your booking page opens (Light, Dark or Follow device). Until now it always opened dark.",
          es: "Claro u oscuro: en Ajustes → Salón → Estilo elige cómo se abre tu página de reservas (Claro, Oscuro o Según el dispositivo). Hasta ahora siempre se abría en oscuro.",
        },
      },
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Stempelkaart: kies bij Instellingen → Klanten & marketing 'Alle klanten' of 'Alleen gekozen klanten'. Bij gekozen klanten zet je per klant de schakelaar 'Stempelkaart' aan op haar klantkaart; alleen zij sparen en krijgen een code.",
          en: "Loyalty card: under Settings → Clients & marketing choose 'All clients' or 'Only chosen clients'. With chosen clients you turn on the 'Loyalty card' switch on a client's card; only they collect stamps and get a code.",
          es: "Tarjeta de fidelidad: en Ajustes → Clientes y marketing elige «Todos los clientes» o «Solo clientes elegidos». Con clientes elegidos activas el interruptor «Tarjeta de fidelidad» en la ficha del cliente; solo ellos acumulan sellos y reciben un código.",
        },
      },
      {
        kind: "fix", audience: ["owner"],
        text: {
          nl: "Klanten: dubbele klanten worden weer herkend (ook als het nummer eens als 06 en eens als +316 is ingevuld, of bij dezelfde naam) en samenvoegen werkt weer, ook na een eerdere samenvoeging.",
          en: "Clients: duplicate clients are recognised again (also when the number was entered once as 06 and once as +316, or with the same name) and merging works again, also after an earlier merge.",
          es: "Clientes: los clientes duplicados se vuelven a reconocer (también si el número se escribió una vez como 06 y otra como +316, o con el mismo nombre) y combinar vuelve a funcionar, también tras una combinación anterior.",
        },
      },
    ],
  },
  {
    id: "2026-09-07b",
    date: "2026-09-07",
    title: { nl: "Vooruitbetalen", en: "Paying in advance", es: "Pago por adelantado" },
    items: [
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Vooruitbetalen: klanten kunnen bij het boeken vooraf betalen (aanzetten bij Instellingen → Betaalverzoeken; werkt met je betaallink en/of IBAN). De afspraak staat als reservering in je agenda tot jij op 'Betaling ontvangen' tikt; niet betaald binnen de termijn, dan vervalt hij vanzelf en komt de tijd weer vrij.",
          en: "Paying in advance: clients can pay upfront when booking (enable it under Settings → Payment requests; works with your payment link and/or IBAN). The appointment sits in your agenda as a reservation until you tap 'Payment received'; not paid within the deadline, and it expires by itself, freeing the slot.",
          es: "Pago por adelantado: los clientes pueden pagar al reservar (actívalo en Ajustes → Solicitudes de pago; funciona con tu enlace de pago y/o IBAN). La cita queda como reserva en tu agenda hasta que pulses «Pago recibido»; si no paga dentro del plazo, caduca sola y la hora vuelve a quedar libre.",
        },
      },
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Vooruitbetaald en toch een duurdere behandeling gekozen? Pas de afspraak aan via 'Bewerk': de klant krijgt dan alleen het verschil als betaalverzoek, de kaart toont wat er nog openstaat, en de factuur trekt de vooruitbetaling af. Eén factuur, geen twee.",
          en: "Paid in advance but chose a more expensive treatment? Adjust the appointment via 'Edit': the client then only gets the difference as a payment request, the card shows what is still open, and the invoice deducts the prepayment. One invoice, not two.",
          es: "¿Pagó por adelantado pero eligió un tratamiento más caro? Ajusta la cita con «Editar»: el cliente solo recibe la diferencia como solicitud de pago, la tarjeta muestra lo que queda pendiente y la factura descuenta el pago por adelantado. Una factura, no dos.",
        },
      },
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Te veel vooruitbetaald (goedkopere behandeling gekozen)? De kaart toont het bedrag; vraag via WhatsApp het rekeningnummer, maak het over en tik op 'Terugbetaald': de klant krijgt een bevestiging.",
          en: "Paid too much in advance (cheaper treatment chosen)? The card shows the amount; ask for the account number via WhatsApp, transfer it and tap 'Refunded': the client gets a confirmation.",
          es: "¿Pagó de más por adelantado (eligió un tratamiento más barato)? La tarjeta muestra el importe; pide el número de cuenta por WhatsApp, transfiérelo y pulsa «Devuelto»: el cliente recibe una confirmación.",
        },
      },
      {
        kind: "new", audience: ["staff"],
        text: {
          nl: "Prijs aanpassen op je eigen afspraak (bijvoorbeeld een andere behandeling in de salon): tik op 'Prijs' op de kaart. Had de klant vooruitbetaald, dan krijgt ze automatisch alleen het verschil als betaalverzoek.",
          en: "Adjust the price on your own appointment (for example a different treatment in the salon): tap 'Price' on the card. If the client paid in advance, she automatically gets only the difference as a payment request.",
          es: "Ajusta el precio de tu propia cita (por ejemplo, otro tratamiento en el salón): pulsa «Precio» en la tarjeta. Si el cliente pagó por adelantado, recibe automáticamente solo la diferencia como solicitud de pago.",
        },
      },
      {
        kind: "new", audience: ["staff"],
        text: {
          nl: "Vooruitbetalen: een afspraak met 'Wacht op betaling' is een reservering. Zie je het geld binnenkomen, tik dan op 'Betaling ontvangen'; de klant krijgt dan haar bevestiging.",
          en: "Paying in advance: an appointment marked 'Awaiting payment' is a reservation. Once the money is in, tap 'Payment received' and the client gets her confirmation.",
          es: "Pago por adelantado: una cita con «Pendiente de pago» es una reserva. Cuando llegue el dinero, pulsa «Pago recibido» y el cliente recibirá su confirmación.",
        },
      },
    ],
  },
  {
    id: "2026-09-07",
    date: "2026-09-07",
    title: { nl: "Stempelkaart, reviews en meer", en: "Loyalty card, reviews and more", es: "Tarjeta de fidelidad, reseñas y más" },
    items: [
      {
        kind: "new", audience: ["owner", "staff"],
        text: {
          nl: "Stempelkaart: na elke X bezoeken krijgt de klant automatisch een persoonlijke kortingscode. Instellen bij Instellingen → Klanten & marketing; de stand zie je op elke klantkaart. Teamsalon? Kies 'per teamlid': dan geldt een code alleen bij de medewerker bij wie hij is gespaard.",
          en: "Loyalty card: after every X visits the client automatically gets a personal discount code. Set it up under Settings → Clients & marketing; progress shows on every client card. Team salon? Choose 'per team member': a code is then only valid with the person it was earned with.",
          es: "Tarjeta de fidelidad: tras cada X visitas el cliente recibe automáticamente un código de descuento personal. Actívala en Ajustes → Clientes y marketing; el progreso se ve en cada ficha de cliente. ¿Salón en equipo? Elige «por miembro del equipo»: el código solo vale con la persona con la que se consiguió.",
        },
      },
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Nodig een salon uit (Instellingen → Klanten & marketing): stuur je uitnodiging nu met één tik via WhatsApp, met je eigen boekingspagina erin — meldt zij zich aan, dan krijgen jullie allebei 2 weken gratis.",
          en: "Refer a salon (Settings → Clients & marketing): send your invitation with one tap via WhatsApp, with your own booking page in it — if she signs up, you both get 2 weeks free.",
          es: "Recomienda un salón (Ajustes → Clientes y marketing): envía tu invitación con un toque por WhatsApp, con tu página de reservas incluida; si se registra, ambas conseguís 2 semanas gratis.",
        },
      },
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Reviews: klanten kunnen anoniem plaatsen, en 'Schrijf een review' op je salonpagina stuurt de klant nu echt haar reviewlink.",
          en: "Reviews: clients can post anonymously, and 'Write a review' on your salon page now actually sends the client her review link.",
          es: "Reseñas: los clientes pueden publicar de forma anónima, y «Escribir una reseña» en tu página ahora envía de verdad el enlace al cliente.",
        },
      },
      {
        kind: "new", audience: ["owner"],
        text: {
          nl: "Telefoonnummer op je salonpagina: klanten kiezen nu tussen bellen en WhatsApp (vul je WhatsApp-nummer in bij Contactgegevens).",
          en: "Phone number on your salon page: clients now choose between calling and WhatsApp (fill in your WhatsApp number under Contact details).",
          es: "Teléfono en tu página: los clientes ahora eligen entre llamar y WhatsApp (rellena tu número de WhatsApp en Datos de contacto).",
        },
      },
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "Verjaardag: ook in te vullen bij '+ Afspraak' en bij 'Klant bewerken' — inclusief de datum die de klant zelf bij het boeken invulde.",
          en: "Birthday: can now also be entered under '+ Appointment' and 'Edit client' — including the date the client entered herself when booking.",
          es: "Cumpleaños: ahora también en «+ Cita» y en «Editar cliente», incluida la fecha que el cliente puso al reservar.",
        },
      },
      {
        kind: "improved", audience: ["owner", "staff"],
        text: {
          nl: "Omzet per medewerker: bij een boeking met twee stylisten telt nu ieders eigen deel, niet de hele boeking bij allebei.",
          en: "Revenue per team member: for a booking with two stylists each now counts her own part, not the whole booking for both.",
          es: "Ingresos por miembro del equipo: en una reserva con dos estilistas cada una cuenta ahora su parte, no toda la reserva para ambas.",
        },
      },
      {
        kind: "fix", audience: ["owner"],
        text: {
          nl: "Agenda dagweergave: kaarten overlappen niet meer en gebruiken hun hele hoogte; met een medewerkerfilter telde een boeking met meerdere behandelingen dubbel — opgelost.",
          en: "Agenda day view: cards no longer overlap and use their full height; with a team-member filter a multi-treatment booking counted twice — fixed.",
          es: "Agenda, vista de día: las tarjetas ya no se superponen y usan toda su altura; con un filtro por miembro, una reserva con varios tratamientos contaba doble — corregido.",
        },
      },
      {
        kind: "fix", audience: ["owner", "staff"],
        text: {
          nl: "Boeken en verplaatsen in een team: een blokkade of werktijd van de ene stylist blokkeert niet meer onterecht het deel van de andere.",
          en: "Booking and rescheduling in a team: one stylist's block or working hours no longer wrongly block the other stylist's part.",
          es: "Reservar y reprogramar en equipo: un bloqueo u horario de una estilista ya no bloquea indebidamente la parte de la otra.",
        },
      },
    ],
  },
];

// Alles wat nieuwer is dan wat deze gebruiker al zag én dan haar account,
// gefilterd op doelgroep. Leeg = niets tonen.
export function unseenReleases({ lastSeenId, userCreatedAt, audience }) {
  const created = userCreatedAt ? String(userCreatedAt).slice(0, 10) : "";
  return RELEASES
    .filter((r) => (!lastSeenId || r.id > lastSeenId) && (!created || r.date > created))
    .map((r) => ({ ...r, items: r.items.filter((it) => !it.audience || it.audience.includes(audience)) }))
    .filter((r) => r.items.length > 0);
}

export const LATEST_RELEASE_ID = RELEASES[0]?.id || "";
export const seenKey = (userId) => `vellu_release_seen_${userId || "anon"}`;
