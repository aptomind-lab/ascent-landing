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
