-- Reseed van de Bloom Studio-demosalon (vellu.cc/bloomstudio) — idempotent.
-- Alles is relatief aan current_date, dus draai dit vlak vóór je nieuwe
-- hero-screenshots maakt (zie README.md hiernaast). Zondag = gesloten.
-- Alle mail-vlaggen staan aan zodat crons de demo-klanten nooit mailen.
DO $$
DECLARE
  v_owner uuid := '74029064-56c2-44d1-93c2-b814db4059cf';
  first_names text[] := array['Emma','Sophie','Julia','Lieke','Naomi','Sara','Isabella','Mila','Zoe','Anouk','Femke','Nina','Layla','Tess'];
  last_names  text[] := array['de Vries','Jansen','Bakker','Visser','Smit','Meijer','Mulder','Bos','Vos','Peters','Hendriks','Dekker','Kuipers','van Dijk'];
  svc_names text[] := array['Gel Manicure','BIAB New Set','Acrylic New Set','Signature Facial','Lash Lift','Brow Lift & Tint','Brow Shaping','Bikini Wax','Nail Removal'];
  svc_prices numeric[] := array[38,52,60,65,49,39,18,25,15];
  svc_durs int[] := array[45,75,90,60,60,45,20,30,30];
  slot_times text[] := array['09:00','09:45','10:30','11:15','12:00','13:00','13:45','14:30','15:15','16:00','16:45'];
  today_times text[] := array['10:00','11:30','14:30','16:00'];
  today_svcs int[] := array[1,6,4,2];
  d date; i int; n int; k int; si int; ci int;
  v_time text; v_status text; v_paid timestamptz; v_pm text;
  client_ids uuid[] := '{}'; client_emails text[] := '{}';
  ce text;
  v_cid uuid;
BEGIN
  DELETE FROM reviews WHERE owner_id = v_owner;
  DELETE FROM appointments WHERE owner_id = v_owner;
  DELETE FROM clients WHERE email LIKE '%@bloomdemo.example';

  FOR i IN 1..14 LOOP
    ce := lower(first_names[i]) || '.' || lower(replace(last_names[i],' ','')) || '@bloomdemo.example';
    INSERT INTO clients (id, email, first_name, last_name, phone, created_at, last_visit)
    VALUES (gen_random_uuid(), ce, first_names[i], last_names[i],
            '+31 6 ' || (10000000 + i*613377)::text,
            now() - (interval '1 day' * (30 + i*7)),
            current_date - (i % 12))
    RETURNING id INTO v_cid;
    client_ids := array_append(client_ids, v_cid);
    client_emails := array_append(client_emails, ce);
  END LOOP;

  FOR d IN SELECT generate_series(current_date - 42, current_date + 12, interval '1 day')::date LOOP
    CONTINUE WHEN extract(isodow FROM d) = 7;
    IF d = current_date THEN n := 4;
    ELSIF d < current_date THEN n := 3 + floor(random()*3)::int;
    ELSE n := 2 + floor(random()*3)::int;
    END IF;

    FOR k IN 1..n LOOP
      IF d = current_date THEN
        v_time := today_times[k];
        si := today_svcs[k];
      ELSE
        v_time := slot_times[least(11, (k-1)*2 + 1 + floor(random()*2)::int)];
        si := 1 + floor(random()*9)::int;
        IF si > 9 THEN si := 9; END IF;
        IF si >= 7 AND random() < 0.5 THEN si := 1 + floor(random()*4)::int; END IF;
      END IF;

      ci := 1 + floor(random()*14)::int; IF ci > 14 THEN ci := 14; END IF;

      IF d < current_date OR (d = current_date AND k <= 2) THEN
        v_status := 'completed';
        v_paid := (d::timestamp + v_time::time + (svc_durs[si] || ' minutes')::interval) AT TIME ZONE 'Europe/Amsterdam';
        v_pm := CASE WHEN random() < 0.6 THEN 'pin' WHEN random() < 0.7 THEN 'cash' ELSE NULL END;
      ELSE
        v_status := 'confirmed';
        v_paid := NULL;
        v_pm := NULL;
      END IF;

      INSERT INTO appointments (
        owner_id, service_name, service_price, service_duration,
        date, "time", client_name, client_email, client_phone, client_id,
        status, paid_at, payment_method, lang,
        reminder_sent, followup_sent, followup_sent_at, rebook_nudge_sent,
        invoice_sent, created_at
      ) VALUES (
        v_owner, svc_names[si], svc_prices[si], svc_durs[si],
        d, v_time,
        first_names[ci] || ' ' || last_names[ci], client_emails[ci],
        '+31 6 ' || (10000000 + ci*613377)::text, client_ids[ci],
        v_status, v_paid, v_pm, CASE WHEN random() < 0.5 THEN 'nl' ELSE 'en' END,
        true,
        (v_status = 'completed'), CASE WHEN v_status = 'completed' THEN v_paid + interval '1 day' END,
        (v_status = 'completed'),
        (v_status = 'completed' AND random() < 0.68),
        d::timestamp - (interval '1 day' * (2 + floor(random()*8)::int))
      );
    END LOOP;
  END LOOP;

  INSERT INTO reviews (id, appointment_id, owner_id, client_name, client_email, rating, comment, created_at)
  SELECT gen_random_uuid(), a.id, v_owner, a.client_name, a.client_email,
    CASE WHEN a.rn <= 2 THEN 4 ELSE 5 END,
    (array[
      'Absolutely love my nails, Bloom never disappoints!',
      'Zo blij met mijn wenkbrauwen, echt een aanrader.',
      'Best facial I have had in Amsterdam.',
      'Super friendly and my BIAB set looks flawless.',
      'Fijne salon, altijd op tijd en top resultaat.',
      'My lashes look amazing, thank you!',
      'Heerlijk verwend, kom zeker terug.',
      'Beautiful salon and lovely staff.',
      'Perfecte gelmanicure, hield drie weken perfect.',
      'Great attention to detail, highly recommend.',
      'Echt de fijnste salon van de stad.',
      'So happy I found this place!',
      'Prachtig resultaat en een eerlijke prijs.',
      'Altijd een momentje voor mezelf, top!',
      'Wonderful experience from start to finish.',
      'Mijn acrylnagels zitten perfect, dankjewel!',
      'Love the vibe and the results.',
      'Zeer professioneel en superlief team.'
    ])[a.rn],
    a.date + interval '34 hour'
  FROM (
    SELECT id, client_name, client_email, date, row_number() OVER (ORDER BY random()) AS rn
    FROM appointments
    WHERE owner_id = v_owner AND status = 'completed' AND date < current_date
  ) a
  WHERE a.rn <= 18;
END $$;
