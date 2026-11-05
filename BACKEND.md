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
- **Comisión** = total cobrado (ya con descuento) × % de comisión del código.
- Wompi cobra en pesos. Colombia usa su lista en pesos; US y México se convierten
  con `TRM × 1,02` redondeado a centenas, y la tasa usada queda guardada en el pedido.
- Cambiar el % de un código solo afecta pedidos **nuevos**: cada pedido conserva
  el porcentaje con que se vendió.
- Un pedido cuenta para comisión **solo** cuando Wompi lo aprueba. Un pedido
  abandonado o rechazado no genera nada.

## 3. Usar el panel (`/admin`)

- **Pedidos:** filtros por estado, código, fecha o búsqueda. Clic en una fila para
  ver productos, desglose y datos de envío. *Exportar CSV* para contabilidad.
- **Afiliados:** crea códigos (ej. `MARIA10`) con su descuento y comisión. Cada
  afiliado muestra clientes que usaron el código, clientes que compraron, ventas,
  comisión generada y lo que se le debe. Tras transferirle, usa **Marcar pagadas**.
  Un código con pedidos no se borra, solo se desactiva.
- **Stock:** interruptor por producto y presentación.
- **Ajustes:** fija la TRM a mano si la fuente oficial falla o el dólar se mueve mucho.

Estados de pedido: *Pendiente* (esperando a Wompi), *Pagado*, *Rechazado*,
*Anulado*, *Error* y **Revisar** (Wompi aprobó un monto distinto al calculado:
no cuenta como venta, revísalo a mano).

## 4. Desarrollo local

```bash
npm install
npm run dev     # http://127.0.0.1:4180, base en memoria y Wompi simulado
npm test        # 35 pruebas del backend
```

`npm run dev` no necesita ninguna cuenta. El panel queda en
`http://127.0.0.1:4180/admin` con la contraseña `dev-password-123`. El botón de
pago abre una página de Wompi simulada que envía el mismo webhook firmado, de modo
que se puede recorrer el flujo completo sin cobrar nada.

## 5. Seguridad: lo que ya está resuelto

- Solo un webhook con firma válida puede marcar un pedido como pagado. No existe
  ningún camino desde el navegador para hacerlo (a propósito: ver `api/_lib/wompi.js`).
- Un monto aprobado distinto al cobrado deja el pedido en *Revisar*.
- Sesión de administrador en cookie `HttpOnly` + `SameSite=Strict`, con bloqueo por IP
  tras 8 contraseñas erróneas en 15 minutos, y verificación de origen en cada acción.
- El panel sirve con política de seguridad estricta (sin scripts inline) y no se indexa.
- El texto de los clientes se muestra como texto, nunca como HTML; el CSV neutraliza
  fórmulas de hoja de cálculo.

## 6. Pendiente / a tener en cuenta

- **No probado contra Neon real**: las pruebas usan Postgres en memoria. Verifica el
  primer despliegue con las llaves de sandbox antes de abrirlo al público.
- **Límite de peticiones** en `/api/checkout` y `/api/store`: no hay uno propio. Se
  puede agregar una regla de rate limit en Vercel → Firewall.
- **Newsletter:** el formulario del 10 % del sitio no captura correos
  (`NEWSLETTER.endpoint` es `null` en `assets/site.js`), por lo que ese código nunca
  se entrega. Si lo activas, sus códigos deben crearse en el servidor, igual que los
  de afiliado; un código generado en el navegador no puede validarse.
- **Wompi cobra en pesos para los tres mercados.** Confirma con Wompi que tu cuenta
  acepta tarjetas emitidas fuera de Colombia, porque los pedidos de US y México se
  cobran igual en COP.
