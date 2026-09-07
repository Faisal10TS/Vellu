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
