# Backend: pagos con Wompi y panel de administración

Este documento reemplaza a `PAYMENT-HANDOFF.md`. Todo lo que describe ya está
construido y probado; lo único que falta son los pasos de la sección 1, que
requieren tus cuentas de Vercel y Wompi.

## Qué hace

- **Checkout con Wompi.** El carrito lleva a `/checkout` (dirección, aceptación de
  uso en investigación, código de descuento). El servidor calcula el precio, guarda
  el pedido y envía al cliente a Wompi con la firma de integridad. Wompi confirma
  el pago por webhook y solo entonces el pedido queda **Pagado**.
- **Panel en `/admin`.** Pedidos con desglose (subtotal, descuento, total cobrado,
  comisión), códigos de afiliado, reporte por afiliado, stock y TRM.
- **Portal `/afiliados`.** Cada afiliado entra con su propio usuario y ve quiénes usaron su
  código, su avance en el mes y cuánto le falta para el siguiente nivel de comisión.
- **Stock en vivo.** Un producto agotado en el panel muestra "Agotado" en la página
  y no se puede comprar (llega a los visitantes en ~10 segundos).

## 1. Puesta en marcha (una sola vez)

### a) Base de datos (Neon, desde Vercel)

1. Vercel → tu proyecto → **Storage** → **Create Database** → **Neon (Postgres)**.
2. Conéctala al proyecto. Vercel agrega `DATABASE_URL` solo.

Las tablas se crean automáticamente la primera vez que se usa; no hay migraciones.

### b) Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Qué es | Dónde se obtiene |
|---|---|---|
| `ADMIN_PASSWORD` | Contraseña del panel, **mínimo 10 caracteres**. Usa una frase larga. | La inventas tú |
| `WOMPI_PUBLIC_KEY` | Llave pública (`pub_test_…` o `pub_prod_…`) | Wompi → Desarrolladores |
| `WOMPI_INTEGRITY_SECRET` | Secreto de integridad | Wompi → Desarrolladores → *Secretos para integración técnica* |
| `WOMPI_EVENTS_SECRET` | Secreto de eventos | Misma pantalla |
| `SITE_URL` | *(opcional)* `https://ascentcompounds.com` | Fija a dónde regresa el cliente |

Estos valores **nunca** van en el código ni se pegan en un chat. La llave de
integridad permite firmar pedidos: quien la tenga puede cobrar un peso por
cualquier compra.

### c) Webhook en Wompi

En Wompi → Desarrolladores → **Eventos**, configura la URL:

```
https://ascentcompounds.com/api/wompi-webhook
```

Sandbox y producción tienen cada uno su propia URL y su propio secreto de eventos.

### d) Probar primero en sandbox

Empieza con las llaves `pub_test_…` y sus secretos de sandbox. Haz una compra de
prueba, confirma que el pedido aparece como **Pagado** en `/admin`, y solo
entonces cambia a las llaves `pub_prod_…`. La llave pública indica a qué entorno
apunta el despliegue; no hay otro interruptor.

## 2. Cómo se calcula el dinero

- El navegador **nunca** envía precios. Envía producto, presentación, cantidad y
  código; el servidor busca el precio en `assets/data.js` y `assets/markets.js`
  (la misma fuente que usa la tienda, así que un cambio de precio es una sola edición).
- **Descuento** = subtotal × % del código.
- **Comisión por mes calendario.** Se calcula por mes (hora de Colombia, por fecha de
  pago) sobre lo que los clientes pagaron con el código, ya con descuento. Cada afiliado
  tiene **un método**, que eliges en *Editar* del afiliado:
  - **Escalonada (estándar):** empieza en **15 %** y suma **5 puntos por cada COP 1.000.000**
    vendido en el mes, hasta un máximo de **40 %** (0 → 15 %, 1 M → 20 %, 2 M → 25 %,
    3 M → 30 %, 4 M → 35 %, 5 M o más → 40 %). El nivel alcanzado define el porcentaje de
    **todas** las ventas de ese mes, no solo del excedente. Los saltos son por escalón, no
    gradual: con COP 1.999.999 se gana 20 %; con 2.000.000, 25 %.
  - **Porcentaje fijo:** un % que tú le das a esa persona, sin escala.
- La escala es **global**; si quieres otra, edítala en **Ajustes → Escala de comisión**
  (máx. 10 niveles; uno más alto no puede pagar menos que uno más bajo). *Restablecer
  estándar* vuelve a 15 %…40 %. Cambiar el método de un afiliado conserva su % fijo
  guardado por si lo vuelves a usar.
- **Moneda del afiliado.** Todo se gana en pesos colombianos (lo que cobra Wompi y la base
  de la escala). En *Editar* eliges el país del afiliado: **Colombia (COP)**, **México (MXN)**
  o **Estados Unidos (USD)**. Su portal y tu panel muestran sus cifras en esa moneda
  (USD = COP ÷ TRM; MXN = COP ÷ (TRM ÷ MXN por dólar); la tasa MXN se toma de
  Frankfurter y puedes fijarla en Ajustes). Mientras un mes no se paga, la conversión es
  **aproximada** (tasa de hoy); al marcarlo pagado se congelan el monto en su moneda y la
  tasa usada. Los niveles de la escala siguen midiéndose en COP.
- Durante el mes la comisión es **provisional**; se fija al cerrar el mes y se paga
  después. Un pedido anulado sale de las ventas del mes.
- Wompi cobra en pesos. Colombia usa su lista en pesos; US y México se convierten
  con `TRM × 1,02` redondeado a centenas, y la tasa usada queda guardada en el pedido.
- Al marcar un mes como **pagado** se congelan sus ventas, su porcentaje y su monto.
  Cambiar la escala o el método después **no** reescribe lo ya pagado; sí afecta a los meses
  que aún no se han pagado.
- Un pedido cuenta para comisión **solo** cuando Wompi lo aprueba. Un pedido
  abandonado o rechazado no genera nada.

## 3. Usar el panel (`/admin`)

- **Pedidos:** filtros por estado, código, fecha o búsqueda. Clic en una fila para
  ver productos, desglose y datos de envío. *Exportar CSV* para contabilidad.
- **Afiliados:** crea códigos (ej. `MARIA10`) con su descuento. Cada fila muestra clientes
  que usaron el código, clientes que compraron, ventas del mes con su nivel, comisión
  provisional y lo que se le debe de meses cerrados.
  - **Liquidaciones:** mes a mes (ventas, nivel, comisión). Tras transferirle, pulsa
    **Marcar pagado** en un mes cerrado.
  - **Acceso:** crea el usuario del afiliado para su portal (ver más abajo).
  Un código con pedidos no se borra, solo se desactiva.
- **Stock:** interruptor por producto y presentación.
- **Ajustes:** escala de comisión (con *Restablecer estándar*), TRM y pesos mexicanos por
  dólar (fíjalas a mano si la fuente oficial falla).

Estados de pedido: *Pendiente* (esperando a Wompi), *Pagado*, *Rechazado*,
*Anulado*, *Error* y **Revisar** (Wompi aprobó un monto distinto al calculado:
no cuenta como venta, revísalo a mano).

## 3a. Programa de Puntos: Etapa 1 (cuentas y políticas)

Esta etapa deja listas las cuentas de afiliado; los Puntos, los niveles de Optimización y el
cierre de mes llegan en la Etapa 2.

- **Registro propio:** cualquiera se afilia gratis en `/afiliados` (o con un enlace de
  invitación `/afiliados?ref=XXXXXXXX`). Se crea su cuenta y su **código de descuento**
  (7 % para sus clientes, modo "Plan de Puntos").
- **Quién te afilió (opcional):** el formulario tiene un campo "Código de quien te afilió".
  Acepta el **código de descuento** de esa persona (por ejemplo `MARIA47`) o el que viene en su
  enlace de invitación, y al salir del campo confirma el nombre ("✓ Te afilia María") para
  detectar errores. Si se deja en blanco, la persona fue afiliada por Ascent directamente y no
  tiene patrocinador. Un código que no existe se rechaza. Cuando llegue la Etapa 2, el
  patrocinador recibe el 5 % del valor de lo que genere cada persona que afilió.
- **Cambiar el patrocinador (solo tú):** en Afiliados, el botón **Patrocinador** de cada
  persona con cuenta permite asignarlo, cambiarlo o quitarlo escribiendo el código de quien la
  afilió. No puede ser ella misma ni crear un círculo (nadie puede quedar por encima de su
  propio patrocinador). Cada cambio queda guardado en `sponsor_changes`. Las propias personas
  no pueden cambiarlo.
- **Políticas:** al registrarse debe marcar que las acepta. Se guardan versión, fecha, medio
  e IP (`terms_acceptances`). El texto está en `api/_lib/terms.js` y es un **borrador**: el
  texto final lo define el abogado. Al cambiar `VERSION`, todos deben aceptar de nuevo al
  entrar.
- **Afiliados por mí:** cada afiliado ve a quienes invitó (un solo nivel, nombre abreviado, sin
  datos de contacto). El patrocinador se guarda una vez al registrarse y no se puede cambiar.
- **Recuperar contraseña por correo** (Resend). Variables en Vercel: `RESEND_API_KEY` y
  `MAIL_FROM` (por ejemplo `Ascent Labs <no-reply@ascentcompounds.com>`, en un dominio
  verificado en Resend). Sin ellas no se envía nada y el sitio responde igual.
- **Idiomas:** el portal está en español e inglés (selector ES/EN).
- Las cuentas creadas por el administrador (botón **Acceso**) también deben aceptar las
  políticas la primera vez.
- En el panel, "Editar" un afiliado permite elegir **Plan de Puntos** o **Porcentaje fijo
  (efectivo)**. Los afiliados del plan no muestran cifras de comisión en efectivo.
- `.vercelignore` evita que `*.md`, `tests/` y `scripts/` se publiquen en el sitio.

## 3a-2. Programa de Puntos: Etapa 2 (motor de Puntos y cierre de mes)

**Volumen del mes** = lo que el afiliado compró para sí mismo + lo que sus clientes compraron con
su código, en MXN, por mes calendario (hora de Colombia, por fecha de aprobación del pago).

| Volumen del mes (MXN) | Optimización | Puntos |
|---|---|---|
| menos de 20,000 | sin activar (o el piso, si sigue vigente) | 0 % |
| 20,000 | 1 (piso) | 10 % |
| 25,000 | 2 | 15 % |
| 30,000 | 3 | 20 % |
| 35,000 | 4 | 25 % |
| 40,000 | 5 | 30 % |
| 45,000 o más | 6 (tope) | 35 % |

- **El piso:** al llegar a 20,000 en un mes, el 10 % queda asegurado 12 meses desde ese mes. Si en
  ese año no repite un mes de 20,000, se pierde. Los niveles de arriba se ganan cada mes.
- **Puntos:** 1 Punto = $1 MXN. Se calculan por pedido (porcentaje del mes x valor del pedido) y se
  entregan **al cerrar el mes**. Se pueden usar **15 días después del cierre**. Solo se cambian por
  productos.
- **Bono de referidos:** el patrocinador recibe 5 % del valor de lo que compra y vende cada
  afiliado que afilió directamente (un solo nivel), siempre que su propio piso esté vigente. Nunca
  se paga de modo que descuento + porcentaje + bono pase del límite de negocio (48 %): si pasara,
  se recorta el bono.
- **Un pedido, un afiliado:** una compra de un afiliado sin código o con su propio código es su
  compra propia; con el código de otro afiliado, es venta de ese otro (no se paga dos veces).
  Solo participan los afiliados en **Plan de Puntos**; los de porcentaje fijo siguen en efectivo.
- **Cierre de mes (pestaña Puntos):** muestra el mes que toca cerrar (se cierran en orden, uno a
  uno, nunca el mes en curso). Primero hay una **vista previa** que no guarda nada. Al confirmar:
  se congela el valor en MXN de cada pedido (con las tasas de ese momento), se guarda el mes de
  cada afiliado y se agregan los Puntos al libro. Si se interrumpe, se puede volver a cerrar sin
  duplicar nada.
- **Libro de Puntos** (`points_ledger`): solo se agregan movimientos; la base de datos ignora
  cualquier cambio o borrado. Las correcciones son **ajustes** con su motivo (botón *Ajustar* en
  Puntos). Quien tiene Puntos o meses guardados no se puede borrar, solo desactivar.
- **Ajustes > Plan de Puntos:** todos los números (activación, escalón, porcentajes, bono, descuento,
  límite de negocio, días de espera, vencimiento, duración del piso, tope de compra propia opcional,
  IVA). No deja guardar una combinación que pase del límite de negocio. Un cambio vale para los
  meses que aún no se cierran.
- **Portal del afiliado:** en Inicio ve "Cómo voy este mes" (volumen, barra, cuánto falta, cuántos
  Puntos pagaría **todo el mes** si llega al siguiente nivel, días que quedan, hasta cuándo está
  asegurado su piso) y en **Mis Puntos** su saldo disponible, en espera (con fecha) y su historial
  por mes.
- **Pendiente (Etapa 3):** canjear Puntos en la tienda y el vencimiento automático. La fecha de
  vencimiento que se muestra hoy es informativa (12 meses desde su última compra o último ingreso
  de Puntos).

## 3b. Portal de afiliados (`/afiliados`)

Cada afiliado entra con **su correo y su contraseña** y ve únicamente lo suyo: quiénes
usaron su código, qué se vendió, el nivel que lleva este mes, **cuánto le falta para el
siguiente nivel**, lo que tiene por cobrar y lo que ya se le pagó.

**Crear un acceso:** Afiliados → **Acceso** → escribe su correo → **Crear acceso**. El panel
muestra una contraseña temporal **una sola vez**, con un mensaje listo para copiar y
enviárselo por un canal privado. Al entrar por primera vez le exige crear una propia.
"Nueva contraseña" genera otra temporal y cierra sus sesiones; "Quitar acceso" lo desactiva
sin tocar su código ni sus ventas.

**Privacidad (decisión por defecto):** el afiliado ve a cada persona con el **nombre
abreviado y la ciudad** ("Laura R., Medellín"). Nunca ve correo, teléfono ni dirección. Así no
puede llevarse a los clientes y se respeta que esos datos se entregaron a Ascent. Hay una
prueba automática que falla si alguno de esos datos aparece en las respuestas del portal.

## 4. Desarrollo local

```bash
npm install
npm run dev     # http://127.0.0.1:4180, base en memoria y Wompi simulado
npm test        # 67 pruebas del backend
```

`npm run dev` no necesita ninguna cuenta. El panel queda en
`http://127.0.0.1:4180/admin` con la contraseña `dev-password-123`; el portal de afiliados,
en `/afiliados`, con `maria@example.com` / `maria-demo-123`. El botón de
pago abre una página de Wompi simulada que envía el mismo webhook firmado, de modo
que se puede recorrer el flujo completo sin cobrar nada.

## 5. Seguridad: lo que ya está resuelto

- Solo un webhook con firma válida puede marcar un pedido como pagado. No existe
  ningún camino desde el navegador para hacerlo (a propósito: ver `api/_lib/wompi.js`).
- Un monto aprobado distinto al cobrado deja el pedido en *Revisar*.
- Sesión de administrador en cookie `HttpOnly` + `SameSite=Strict`, con bloqueo por IP
  tras 8 contraseñas erróneas en 15 minutos, y verificación de origen en cada acción.
- Las contraseñas de afiliados se guardan solo como hash (scrypt); la temporal se muestra una
  vez. Cambiar o restablecer una contraseña cierra todas las sesiones anteriores, y un correo
  inexistente recibe la misma respuesta que una contraseña errónea.
- Cada consulta del portal se limita al código de la sesión firmada, nunca a un dato enviado
  por el navegador; la sesión de afiliado no abre el panel de administración ni al revés.
- El panel sirve con política de seguridad estricta (sin scripts inline) y no se indexa.
- El texto de los clientes se muestra como texto, nunca como HTML; el CSV neutraliza
  fórmulas de hoja de cálculo.

## 6. Pendiente / a tener en cuenta

- **No probado contra Neon real**: las pruebas usan Postgres en memoria. Verifica el
  primer despliegue con las llaves de sandbox antes de abrirlo al público.
- **Límite de peticiones** en `/api/checkout` y `/api/store`: no hay uno propio. Se
  puede agregar una regla de rate limit en Vercel → Firewall.
- Las sesiones de afiliados se firman con una clave derivada de `ADMIN_PASSWORD`: si la
  cambias, también salen todos los afiliados.
- **Newsletter:** el formulario del 10 % del sitio no captura correos
  (`NEWSLETTER.endpoint` es `null` en `assets/site.js`), por lo que ese código nunca
  se entrega. Si lo activas, sus códigos deben crearse en el servidor, igual que los
  de afiliado; un código generado en el navegador no puede validarse.
- **Wompi cobra en pesos para los tres mercados.** Confirma con Wompi que tu cuenta
  acepta tarjetas emitidas fuera de Colombia, porque los pedidos de US y México se
  cobran igual en COP.
