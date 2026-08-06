/**
 * Spanish, keyed by the English source string. See ./index.ts for why the key
 * is the English rather than an invented identifier.
 *
 * Voseo throughout — "revisá", "aprobalo", "podés". This app is Paraguayan:
 * every bank, merchant and promo in it is, the coach already answers that way,
 * and "revisa/apruebas" would read as a translation of a foreign app rather
 * than an app written where the user lives.
 *
 * A missing entry falls back to English, so this file can be incomplete without
 * anything breaking — an untranslated label is a small flaw, a crash is not.
 */
export const ES: Record<string, string> = {
  // ---- Screen titles. The bottom nav is icon-only, so there are no tab
  // labels here — and "Home" below is the offer category, not a tab.
  Offers: 'Promos',
  Settings: 'Ajustes',

  // ---- Dashboard ----
  'Safe to Spend': 'Disponible',
  'Income this month': 'Ingresos del mes',
  'Account overdrawn': 'Cuenta en negativo',
  'Your balance': 'Tu saldo',
  'Starting balance': 'Saldo inicial',
  'Configure balances': 'Configurar saldos',
  'Set what you actually have today — Home and the Dashboard adjust to match.':
    'Poné lo que realmente tenés hoy — Inicio y el Dashboard se ajustan solos.',
  'Available balance': 'Saldo disponible',
  'Available credit': 'Crédito disponible',
  '{balance} in your account. {inn} in and {out} out in {month}.':
    '{balance} en tu cuenta. {inn} entró y {out} salió en {month}.',
  '{balance} below zero. {inn} in and {out} out in {month}.':
    '{balance} bajo cero. {inn} entró y {out} salió en {month}.',
  'You’re {amount} below zero. Log any income you have not recorded, or ask me for a plan.':
    'Estás {amount} bajo cero. Registrá los ingresos que te falten, o pedime un plan.',
  '{n} day left in {month}': 'queda {n} día de {month}',
  '{n} days left in {month}': 'quedan {n} días de {month}',
  'Where it’s going': 'En qué se va',
  'Spending trajectory': 'Trayectoria del gasto',
  Transactions: 'Movimientos',
  Subscriptions: 'Suscripciones',
  'See all': 'Ver todo',
  'tap a slice': 'tocá una porción',
  'This month': 'Este mes',
  'Can I afford this?': '¿Me alcanza para esto?',
  'Simulate a purchase against your savings': 'Simulá una compra contra tus ahorros',

  // ---- Home ----
  'Welcome back!': '¡Bienvenido de vuelta!',
  'For you today': 'Para vos hoy',
  'AI Insights': 'Análisis IA',
  'Ask the coach': 'Preguntale al coach',
  'Review subscriptions': 'Revisar suscripciones',
  'Evaluate your spending patterns': 'Evaluá tus hábitos de gasto',
  'Set a cap in chat': 'Poné un límite en el chat',
  'Open in vault': 'Abrir en facturas',
  'See the terms': 'Ver las condiciones',
  "You're pacing well": 'Vas a buen ritmo',
  Spent: 'Gastado',

  // ---- Offers ----
  'All banks': 'Todos los bancos',
  'All categories': 'Todas las categorías',
  'Search a shop or restaurant': 'Buscá un comercio o restaurante',
  'No offers right now': 'No hay promos por ahora',
  'No offers match this filter': 'Ninguna promo coincide con este filtro',
  'Try a different category.': 'Probá con otra categoría.',
  "Card discounts from your banks will show up here once they're synced.":
    'Los descuentos de tus tarjetas van a aparecer acá cuando se sincronicen.',
  'LOADING…': 'CARGANDO…',
  'sin interés': 'sin interés',
  'Today only': 'Solo hoy',

  // ---- Offer categories ----
  'Supermarkets & Groceries': 'Supermercados',
  'Restaurants & Food': 'Restaurantes',
  'Fashion & Accessories': 'Moda y accesorios',
  'Beauty & Wellness': 'Belleza y bienestar',
  Pharmacies: 'Farmacias',
  'Home & Furniture': 'Hogar y muebles',
  'Electronics & Media': 'Electrónica',
  'Automotive & Fuel': 'Combustible y autos',
  'Entertainment & Travel': 'Ocio y viajes',
  'Other / Services': 'Otros / Servicios',
  Groceries: 'Súper',
  Food: 'Comida',
  Fashion: 'Moda',
  'Beauty & spa': 'Belleza',
  Pharmacy: 'Farmacia',
  'Fuel & auto': 'Combustible',
  'Fun & travel': 'Ocio',
  Other: 'Otros',
  Electronics: 'Electrónica',

  // ---- Spending categories (theme.ts CATS) ----
  'Food & Drink': 'Comida y bebida',
  'Bills & Subs': 'Servicios y subs',
  Shopping: 'Compras',
  Transport: 'Transporte',
  Income: 'Ingresos',
  'Debt & interest': 'Deuda e intereses',

  // ---- Chat ----
  'Message your coach…': 'Escribile a tu coach…',
  Expense: 'Gasto',
  'Card payment': 'Pago de tarjeta',
  'Cancel subscription': 'Cancelar suscripción',
  'Delete subscription': 'Eliminar suscripción',
  'New subscription': 'Nueva suscripción',
  'Update subscription': 'Actualizar suscripción',
  Logged: 'Registrado',
  'Payment recorded': 'Pago registrado',
  Cancelled: 'Cancelada',
  Deleted: 'Eliminada',
  Added: 'Agregada',
  Updated: 'Actualizada',
  'Approve & log': 'Aprobar y registrar',
  'Approve & pay': 'Aprobar y pagar',
  'Approve & cancel': 'Aprobar y cancelar',
  'Approve & delete': 'Aprobar y eliminar',
  'Approve & add': 'Aprobar y agregar',
  'Approve & update': 'Aprobar y actualizar',
  Reject: 'Rechazar',
  'Business expense': 'Gasto de empresa',
  'Money in — raises what you can safely spend': 'Dinero que entra — sube lo que podés gastar',
  'Towards this card — lowers what you owe': 'A esta tarjeta — baja lo que debés',
  'Stops counting towards your monthly total': 'Deja de contar en tu total mensual',
  'Removed from your list · past charges stay in your movements':
    'Se saca de tu lista · los cobros que ya hizo quedan en tus movimientos',
  'Charges it already made stay in your movements. Delete those there to get the money back.':
    'Los cobros que ya hizo quedan en tus movimientos. Eliminalos desde ahí para recuperar la plata.',
  'Updates this subscription': 'Actualiza esta suscripción',
  'Reading your factura': 'Leyendo tu factura',
  'Pulling merchant, total & VAT…': 'Extrayendo comercio, total e IVA…',
  'Charges every month, from the': 'Se cobra todos los meses, desde el',
  'Renews the': 'Se renueva el',
  'Billed in': 'Facturado en',
  On: 'En',

  // ---- Cards ----
  'Credit cards': 'Tarjetas de crédito',
  'Add card': 'Agregar tarjeta',
  'Add a card': 'Agregar una tarjeta',
  'Edit card': 'Editar tarjeta',
  'No cards yet — add one below.': 'Todavía no hay tarjetas — agregá una abajo.',
  // What a card has left, which is what each row leads with. Plural because it
  // agrees with the currency in the amount ("₲7.343.602 disponibles"), not with
  // the word "saldo".
  '{amount} available': '{amount} disponibles',
  '{amount} used': '{amount} usado',
  'of {amount}': 'de {amount}',
  // Reordered on purpose — "debés ₲4.597.088", not "₲4.597.088 debés". This is
  // the reordering the named placeholders exist to allow.
  '{amount} owed': 'debés {amount}',
  'Card name': 'Nombre de la tarjeta',
  'Balance owed': 'Saldo adeudado',
  'Credit limit': 'Límite de crédito',
  'APR / interest rate (%)': 'TNA / tasa de interés (%)',
  Colour: 'Color',
  'Save changes': 'Guardar cambios',

  // ---- Card payoff ----
  'Set a payment': 'Definí un pago',
  'Monthly payment': 'Pago mensual',
  'Months to pay off': 'Meses para saldar',
  'Target a date': 'Apuntar a una fecha',
  'months to debt-free': 'meses para salir de deudas',
  Done: 'Listo',

  // ---- Afford modal ----
  'Sandbox a purchase before you commit.': 'Probá una compra antes de decidirte.',
  'After purchase': 'Después de la compra',
  'Savings today': 'Ahorros hoy',
  'Yes — comfortably within your buffer.': 'Sí — entra cómodo en tu colchón.',
  'Yes, but it’ll be tight this month.': 'Sí, pero el mes te va a quedar justo.',
  'I’d wait — this cuts deep into your buffer.': 'Yo esperaría — te come buena parte del colchón.',

  // ---- Subscriptions ----
  'Edit subscription': 'Editar suscripción',
  'Renews on day of month': 'Se renueva el día del mes',
  'Paid with': 'Se paga con',
  'No card': 'Sin tarjeta',
  'Mute alerts': 'Silenciar avisos',
  'Log cancelled': 'Marcar como cancelada',
  'Cancelled — no longer charges': 'Cancelada — ya no se cobra',
  'rate unavailable': 'sin cotización',
  "Each renewal is added to this card's balance, the same as any purchase on it.":
    'Cada renovación se suma al saldo de esa tarjeta, igual que cualquier compra.',

  // ---- Transactions ----
  'All transactions': 'Todos los movimientos',
  'No transactions yet.': 'Todavía no hay movimientos.',
  'Edit transaction': 'Editar movimiento',
  'Delete transaction': 'Eliminar movimiento',
  'Tap again to delete': 'Tocá de nuevo para eliminar',
  'Where you paid': 'Dónde pagaste',
  'Pick a date': 'Elegí una fecha',
  'Tax deductible': 'Deducible de impuestos',
  'Flag as a business expense': 'Marcar como gasto de empresa',
  'PAID WITH': 'PAGADO CON',
  'BILLED AS': 'FACTURADO COMO',
  'DISCOUNT APPLIED': 'DESCUENTO APLICADO',

  // ---- Settings ----
  'Base currency': 'Moneda base',
  Language: 'Idioma',
  'Coach tone': 'Tono del coach',
  Friendly: 'Cercano',
  'Budget alerts': 'Avisos de presupuesto',
  'Budget alert': 'Aviso de presupuesto',
  'You’ve gone over this month’s budget.': 'Superaste el presupuesto de este mes.',
  'You’ve used {pct}% of this month’s budget.': 'Ya usaste el {pct}% del presupuesto de este mes.',
  'Voice transcripts': 'Transcripción de voz',
  'On device': 'En el dispositivo',
  'Biometric lock': 'Bloqueo biométrico',
  'Unlock Nummus AI': 'Desbloqueá Nummus AI',
  'App locked. Unlock to continue.': 'App bloqueada. Desbloqueá para continuar.',
  Unlock: 'Desbloquear',
  Off: 'Desactivado',
  'Training on my data': 'Entrenar con mis datos',
  'Sign out': 'Cerrar sesión',
  'You will need to sign in again to reach your data.':
    'Vas a tener que iniciar sesión de nuevo para ver tus datos.',

  // ---- Auth ----
  'Sign in': 'Iniciar sesión',
  'Sign up': 'Crear cuenta',
  'Create account': 'Crear cuenta',
  'Sign in to pick up where you left off.': 'Iniciá sesión para seguir donde lo dejaste.',
  'Create an account to start tracking.': 'Creá una cuenta para empezar a registrar.',
  'No account yet?': '¿Todavía no tenés cuenta?',
  'Already have an account?': '¿Ya tenés cuenta?',
  'or continue with': 'o continuá con',
  'Verify email': 'Verificá tu email',
  'Verification code': 'Código de verificación',
  'Resend code': 'Reenviar código',
  'Use a different email': 'Usar otro email',
  'Just a sec…': 'Un segundo…',
  Email: 'Email',
  Password: 'Contraseña',

  // ---- Loading and errors ----
  'Can’t load your data': 'No pudimos cargar tus datos',
  'Try again': 'Reintentar',
  'Something went wrong.': 'Algo salió mal.',
  'This one needs a newer version of the app to show. Update Nummus AI to see it.':
    'Esto necesita una versión más nueva de la app. Actualizá Nummus AI para verlo.',
  'This version of Nummus AI is too old to read your balance. Update the app.':
    'Esta versión de Nummus AI es demasiado vieja para leer tu saldo. Actualizá la app.',
  'Microphone access is off. Enable it in your phone settings to record a voice note.':
    'El micrófono está desactivado. Activalo en los ajustes del teléfono para grabar una nota de voz.',


  // ---- Sentences assembled with values. The whole clause is one unit because
  // Spanish reorders it — "quedan 3 días" puts the verb first, so translating
  // the fragments separately would produce word salad.
  '{pct}% of {total} · {n} day left': '{pct}% de {total} · queda {n} día',
  '{pct}% of {total} · {n} days left': '{pct}% de {total} · quedan {n} días',
  '{amount} over budget ({pct}%)': '{amount} por encima del presupuesto ({pct}%)',
  '{amount} under pace ({pct}%)': '{amount} por debajo del ritmo ({pct}%)',
  '{amount} over pace ({pct}%)': '{amount} por encima del ritmo ({pct}%)',
  'You’re {amount} past {month}’s budget. I can draft a catch-up plan for the last two weeks.':
    'Te pasaste {amount} del presupuesto de {month}. Puedo armarte un plan para las últimas dos semanas.',
  '{n} active · {total}/mo': '{n} activas · {total}/mes',
  'Your account': 'Tu cuenta',
  Cancel: 'Cancelar',

  Supermarkets: 'Supermercados',
  Restaurants: 'Restaurantes',
  Home: 'Hogar',
  Entertainment: 'Ocio',
  Services: 'Servicios',
  '{category} today': '{category} hoy',
  '{n} TODAY': '{n} HOY',
  'cap {amount}': 'tope {amount}',
  'until {date}': 'hasta {date}',
  '{category} leads your spend': '{category} lidera tu gasto',
  'Nothing in {category} yet.': 'Todavía nada en {category}.',
  SPENT: 'GASTADO',
  Undo: 'Deshacer',
  'Could not sign in with {provider}. Please try again.':
    'No pudimos iniciar sesión con {provider}. Probá de nuevo.',
  'Factura detail': 'Detalle de factura',
  'Needs review.': 'Necesita revisión.',
  'Logged automatically': 'Registrado automáticamente',
  'matched from the scan': 'detectado del escaneo',
  'VAT ID': 'RUC',
  'Missing — tap to add': 'Falta — tocá para agregar',
  'Flag as business expense for your Q3 return': 'Marcar como gasto de empresa para tu declaración',
  Name: 'Nombre',
  TOTAL: 'TOTAL',

  MERCHANT: 'COMERCIO',
  CATEGORY: 'CATEGORÍA',
  Optional: 'Opcional',

  'See all {n}': 'Ver las {n}',
  'Spending above pace': 'Gastando por encima del ritmo',
  '{amount} under your budget pace this month. Safe to spend: {safe}.':
    '{amount} por debajo de tu ritmo de gasto este mes. Disponible: {safe}.',
  '{amount} over your budget pace this month. Safe to spend: {safe}.':
    '{amount} por encima de tu ritmo de gasto este mes. Disponible: {safe}.',
  "{amount} so far — {share}% of everything you've spent in {month}.":
    '{amount} hasta ahora — {share}% de todo lo que gastaste en {month}.',
  '{n} renewal still to come': 'Queda {n} renovación por venir',
  '{n} renewals still to come': 'Quedan {n} renovaciones por venir',
  '{names} renew later this month — {total} total.':
    '{names} se renuevan más adelante este mes — {total} en total.',
  '{n} factura needs review': '{n} factura necesita revisión',
  '{n} facturas need review': '{n} facturas necesitan revisión',
  '{merchant} ({amount}) is missing its VAT number.': 'A {merchant} ({amount}) le falta el RUC.',
  '{n} ACTIVE': '{n} ACTIVAS',
  'Charges the {day}': 'Se cobra el {day}',
  Freelance: 'Freelance',

  // ---- Dates ----
  Today: 'Hoy',
  Yesterday: 'Ayer',

  // ---- Onboarding ----
  'Let’s set up your account': 'Preparemos tu cuenta',
  'A few quick steps and you’re in.': 'Unos pasos rápidos y ya podés entrar.',
  'How should we call you?': '¿Cómo te llamamos?',
  'We’ll greet you by this name around the app.': 'Así te vamos a saludar por la app.',
  'Your name': 'Tu nombre',
  'What do you have available today?': '¿Cuánto tenés disponible hoy?',
  'Set your starting balance and currency — we use them everywhere.':
    'Elegí tu saldo inicial y tu moneda — las usamos en toda la app.',
  'Add your credit cards': 'Agregá tus tarjetas de crédito',
  'Optional — add more anytime from Statistics.': 'Opcional — podés agregar más después desde Estadísticas.',
  'Add another card': 'Agregar otra tarjeta',
  'No cards added yet.': 'Todavía no agregaste tarjetas.',
  Continue: 'Continuar',
  Finish: 'Finalizar',
};
