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
