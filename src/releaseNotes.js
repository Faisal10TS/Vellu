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
    id: "2026-09-08",
    date: "2026-09-08",
    title: { nl: "Stempelkaart voor gekozen klanten", en: "Loyalty card for chosen clients", es: "Tarjeta de fidelidad para clientes elegidos" },
    items: [
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
