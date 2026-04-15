// ═══════════════════════════════════════════════════════════════
// SISTEMA DE GESTIÓN DE NEGOCIOS — FRONTEND (app.js)
// ═══════════════════════════════════════════════════════════════

// ────────────────────────────────────────────
// CONFIGURACIÓN: Pega aquí tu URL de Web App
// ────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbzfQzZsSMVdFPUJ63Q1iWjcMHMxbhVhOWrbMoDyc1z9aCncIusx1iblrjMJqXZoaU8G/exec';

// ────────────────────────────────────────────
// CÓDIGO DE APPS SCRIPT (referencia para copiar)
// Para ver el código completo, abre el archivo code.gs
// ────────────────────────────────────────────
const APPS_SCRIPT_CODE = `
// ═══════════════════════════════════════════════
// INSTRUCCIONES DE DESPLIEGUE:
//
// 1. Abre una hoja de Google Sheets nueva
// 2. Ve a Extensiones > Apps Script
// 3. Borra el contenido y pega TODO el archivo code.gs
// 4. Haz clic en la función "initDB" en el selector y ejecútala
//    (autoriza los permisos cuando lo pida)
// 5. Ve a Implementar > Nueva implementación
//    - Tipo: App web
//    - Ejecutar como: Yo
//    - Quién tiene acceso: Cualquier persona
// 6. Copia la URL que te da y pégala en la constante API_URL
//    de este archivo (app.js) línea 8
// 7. Abre index.html en tu navegador
// ═══════════════════════════════════════════════
`;

// ═══ ESTADO GLOBAL ═══
const state = {
  productos:null, clientes:null, proveedores:null,
  ventas:null, gastos:null, facturas:null,
  deudas:null, config:null, dashboard:null,
  carrito:[], seccionActual:'dashboard'
};
const charts = {};

// ═══════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════
// ─── Indicadores de carga ───
// 1. Loader full-screen: SOLO para la carga inicial del sitio
let _loaderCount=0;
function mostrarLoader(){
  _loaderCount++;
  document.getElementById('loader').classList.add('active');
}
function ocultarLoader(){
  _loaderCount=Math.max(0,_loaderCount-1);
  if(_loaderCount===0) document.getElementById('loader').classList.remove('active');
}

// 2. Busy pill: píldora sutil "Por favor espere..." (para mutaciones)
let _busyCount=0;
function mostrarBusy(texto){
  _busyCount++;
  const pill=document.getElementById('busyPill');
  const t=document.getElementById('busyPillText');
  if(t) t.textContent=texto||'Por favor espere...';
  if(pill) pill.classList.add('active');
}
function ocultarBusy(){
  _busyCount=Math.max(0,_busyCount-1);
  if(_busyCount===0){
    const pill=document.getElementById('busyPill');
    if(pill) pill.classList.remove('active');
  }
}

// 3. Top progress: barra delgada arriba (precarga silenciosa)
let _progressCount=0;
function mostrarProgreso(){
  _progressCount++;
  document.getElementById('topProgress')?.classList.add('active');
}
function ocultarProgreso(){
  _progressCount=Math.max(0,_progressCount-1);
  if(_progressCount===0) document.getElementById('topProgress')?.classList.remove('active');
}

function mostrarToast(mensaje, tipo='success'){
  const c=document.getElementById('toastContainer');
  const t=document.createElement('div');
  t.className='toast toast-'+tipo;
  const icons={success:'check-circle',error:'alert-circle',warning:'alert-triangle'};
  t.innerHTML=`<i data-lucide="${icons[tipo]||'info'}" style="width:18px;height:18px;flex-shrink:0"></i><span>${mensaje}</span>`;
  c.appendChild(t);
  refreshIcons();
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(100%)';t.style.transition='all .3s';setTimeout(()=>t.remove(),300);},3500);
}

function mostrarModal(html, clase=''){
  const overlay=document.getElementById('modalOverlay');
  const content=document.getElementById('modalContent');
  content.className='modal '+clase;
  content.innerHTML='<button class="modal-close" onclick="cerrarModal()">&times;</button>'+html;
  overlay.classList.add('active');
  refreshIcons();
}
function cerrarModal(){ document.getElementById('modalOverlay').classList.remove('active'); }

function formatearMoneda(monto){
  const s=(state.config&&state.config.MonedaSimbolo)||'RD$';
  return s+parseFloat(monto||0).toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function formatearFecha(fecha){
  if(!fecha) return '';
  const d=new Date(fecha+(String(fecha).length===10?'T12:00:00':''));
  if(isNaN(d)) return fecha;
  return d.toLocaleDateString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function hoyStr(){ return new Date().toISOString().split('T')[0]; }

function calcularTotalesCarrito(items, descuento=0, aplicarITBIS=true){
  const subtotal=items.reduce((s,i)=>(parseFloat(i.precio)||0)*(parseInt(i.cantidad)||0)+s,0);
  const pct=(state.config&&parseFloat(state.config.ITBIS_Porcentaje))||18;
  const base=subtotal-descuento;
  const itbis=aplicarITBIS?Math.round(base*(pct/100)*100)/100:0;
  return{subtotal,descuento,itbis,total:base+itbis};
}

function badgeEstado(estado){
  const m={Pendiente:'badge-yellow',Pagada:'badge-green',Completada:'badge-green',Vencida:'badge-red',Cancelada:'badge-gray'};
  return `<span class="badge ${m[estado]||'badge-gray'}">${estado}</span>`;
}

function refreshIcons(){ try{lucide.createIcons();}catch(e){} }

// ═══════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════
async function apiGet(action, params={}){
  let url=API_URL+'?action='+action;
  for(let k in params) if(params[k]!==undefined && params[k]!==null && params[k]!=='') url+='&'+k+'='+encodeURIComponent(params[k]);
  let txt;
  try{
    const r=await fetch(url);
    txt=await r.text();
  }catch(e){
    console.error('[apiGet] fetch error:',e);
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión y la URL del Apps Script.');
  }
  let j;
  try{ j=JSON.parse(txt); }
  catch(e){
    console.error('[apiGet] respuesta no-JSON:',txt.substring(0,200));
    throw new Error('Respuesta inválida del servidor. Verifica que el Apps Script esté implementado con acceso "Cualquier usuario".');
  }
  if(!j.success) throw new Error(j.error||'Error en la API');
  return j.data;
}
async function apiPost(action, data={}){
  data.action=action;
  let txt;
  try{
    // Patrón estándar Apps Script: form-urlencoded con parámetro "payload"
    // → es "simple request", no dispara preflight CORS, soporta el redirect 302
    const body='payload='+encodeURIComponent(JSON.stringify(data));
    const r=await fetch(API_URL,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:body
    });
    txt=await r.text();
  }catch(e){
    console.error('[apiPost] fetch error:',e);
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión y la URL del Apps Script.');
  }
  let j;
  try{ j=JSON.parse(txt); }
  catch(e){
    console.error('[apiPost] respuesta no-JSON:',txt.substring(0,200));
    throw new Error('Respuesta inválida del servidor. ¿Implementaste el Apps Script con acceso "Cualquier usuario"?');
  }
  if(!j.success) throw new Error(j.error||'Error en la API');
  return j.data;
}
// ─── Caché con TTL ───
// Si los datos se cargaron hace menos de CACHE_TTL_MS, se usan directamente.
// Las mutaciones (guardar/eliminar) invalidan vía state[key]=null.
const CACHE_TTL_MS = 60*1000; // 60 segundos
const _cacheTimes = {};

function _esCacheValido(key){
  return state[key]!=null && _cacheTimes[key] && (Date.now()-_cacheTimes[key]) < CACHE_TTL_MS;
}

async function cargarDatos(key, action, force=false){
  // Si hay caché válido y no se fuerza → devuelve sin loader, sin red
  if(!force && _esCacheValido(key)) return state[key];
  const tieneDatosPrevios = state[key]!=null;
  // Barra de progreso sutil en vez de loader brusco
  mostrarProgreso();
  try{
    state[key] = await apiGet(action);
    _cacheTimes[key] = Date.now();
  }catch(e){
    if(!tieneDatosPrevios){ mostrarToast(e.message,'error'); state[key]=state[key]||[]; }
  }finally{
    ocultarProgreso();
  }
  return state[key];
}

function invalidarCache(...keys){
  keys.forEach(k=>{ state[k]=null; delete _cacheTimes[k]; });
}

function refreshData(seccion){
  const map={productos:'getProductos',clientes:'getClientes',proveedores:'getProveedores',ventas:'getVentas',gastos:'getGastos',facturas:'getFacturas',deudas:'getDeudas',config:'getConfig',dashboard:'getDashboard'};
  if(map[seccion]){ invalidarCache(seccion); return cargarDatos(seccion,map[seccion],true); }
}

// ═══════════════════════════════════════════════
// IMAGE UPLOAD — convierte a Base64 y sube al Sheet
// ═══════════════════════════════════════════════
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

async function subirImagen(file){
  if(!file) return '';
  if(file.size>2*1024*1024){ mostrarToast('Imagen muy grande (máx 2MB)','warning'); return ''; }
  try{
    const base64=await fileToBase64(file);
    const result=await apiPost('subirImagen',{imagen:base64,nombre:file.name,tipo:file.type});
    return result.url||result.imageUrl||base64;
  }catch(e){
    // Si falla el upload al sheet, usar base64 inline
    const base64=await fileToBase64(file);
    return base64;
  }
}

// ═══════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════
const sectionTitles={dashboard:'Dashboard',pos:'Punto de Venta',facturas:'Facturas',inventario:'Inventario',clientes:'Clientes',gastos:'Gastos',reportes:'Reportes',config:'Configuración'};

function navegarA(seccion){
  state.seccionActual=seccion;
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById('sec-'+seccion).classList.add('active');
  document.querySelectorAll('.nav-item,.bnav-item').forEach(n=>{n.classList.toggle('active',n.dataset.section===seccion);});
  const titulo=sectionTitles[seccion]||seccion;
  document.getElementById('headerTitle').textContent=titulo;
  const tbs=document.getElementById('topbarSubtitle'); if(tbs) tbs.textContent=titulo;
  toggleSidebar(false); // cerrar drawer al navegar en móvil
  // Scroll al inicio para mejor UX
  window.scrollTo({top:0,behavior:'smooth'});
  cargarSeccion(seccion);
}

// ── Drawer del sidebar (solo móvil) ──
function toggleSidebar(forzar){
  const sb=document.getElementById('sidebar');
  const bd=document.getElementById('sidebarBackdrop');
  if(!sb) return;
  const abierto = forzar===undefined ? !sb.classList.contains('open') : !!forzar;
  sb.classList.toggle('open', abierto);
  if(bd) bd.classList.toggle('open', abierto);
  // Bloquear scroll del body cuando el drawer está abierto
  document.body.style.overflow = abierto ? 'hidden' : '';
}

// Cerrar sidebar con Escape
document.addEventListener('keydown',e=>{ if(e.key==='Escape') toggleSidebar(false); });

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.nav-item,.bnav-item').forEach(n=>{
    n.addEventListener('click',()=>navegarA(n.dataset.section));
  });
  init();
});

async function cargarSeccion(seccion){
  // Sin loader global aquí: cargarDatos() decide si mostrarlo (solo si NO hay caché previo)
  try{
    switch(seccion){
      case 'dashboard': await renderDashboard(); break;
      case 'pos': await renderPOS(); break;
      case 'facturas': await renderFacturas(); break;
      case 'inventario': await renderInventario(); break;
      case 'clientes': await renderClientes(); break;
      case 'gastos': await renderGastos(); break;
      case 'reportes': await renderReportes(); break;
      case 'config': await renderConfig(); break;
    }
    refreshIcons();
  }catch(e){mostrarToast('Error: '+e.message,'error');}
  finally{/* loader manejado por cargarDatos */}
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
async function renderDashboard(){
  const d=await cargarDatos('dashboard','getDashboard');
  const sec=document.getElementById('sec-dashboard');
  let alertas='';
  if(d.productosStockBajo&&d.productosStockBajo.length){
    alertas+=`<div class="alert-box warning"><h4><i data-lucide="alert-triangle" style="width:16px;height:16px;display:inline"></i> Productos con stock bajo</h4><ul>${d.productosStockBajo.map(p=>`<li><strong>${p.Nombre}</strong> — Stock: ${p.Stock} (Mín: ${p.StockMinimo})</li>`).join('')}</ul></div>`;
  }
  sec.innerHTML=`
    ${alertas}
    <div class="cards">
      <div class="card"><div class="card-icon green"><i data-lucide="trending-up"></i></div><div class="card-label">Ventas Hoy</div><div class="card-value text-green">${formatearMoneda(d.ventasHoy)}</div></div>
      <div class="card"><div class="card-icon blue"><i data-lucide="calendar"></i></div><div class="card-label">Ventas del Mes</div><div class="card-value text-blue">${formatearMoneda(d.ventasMes)}</div></div>
      <div class="card"><div class="card-icon ${d.utilidadMes>=0?'green':'red'}"><i data-lucide="dollar-sign"></i></div><div class="card-label">Utilidad del Mes</div><div class="card-value ${d.utilidadMes>=0?'text-green':'text-red'}">${formatearMoneda(d.utilidadMes)}</div></div>
      <div class="card"><div class="card-icon yellow"><i data-lucide="file-clock"></i></div><div class="card-label">Facturas Pendientes</div><div class="card-value text-yellow">${d.facturasPendientes||0}</div></div>
      <div class="card"><div class="card-icon pink"><i data-lucide="users"></i></div><div class="card-label">Clientes</div><div class="card-value text-pink">${d.totalClientes||0}</div></div>
      <div class="card"><div class="card-icon red"><i data-lucide="receipt"></i></div><div class="card-label">Gastos del Mes</div><div class="card-value text-red">${formatearMoneda(d.gastosMes)}</div></div>
      <div class="card"><div class="card-icon ${d.crecimientoMes>=0?'green':'red'}"><i data-lucide="${d.crecimientoMes>=0?'arrow-up-right':'arrow-down-right'}"></i></div><div class="card-label">Crecimiento</div><div class="card-value ${d.crecimientoMes>=0?'text-green':'text-red'}">${d.crecimientoMes>=0?'+':''}${(d.crecimientoMes||0).toFixed(1)}%</div></div>
      <div class="card"><div class="card-icon brown"><i data-lucide="landmark"></i></div><div class="card-label">Deudas</div><div class="card-value text-brown">${formatearMoneda(d.totalDeudaClientes)}</div></div>
    </div>
    <div class="charts-grid">
      <div class="chart-box"><h3>Ventas últimos 30 días</h3><canvas id="chartVentas30"></canvas></div>
      <div class="chart-box"><h3>Método de Pago</h3><canvas id="chartMetodoPago"></canvas></div>
      <div class="chart-box"><h3>Top 5 Productos</h3><div id="topProductosTable"></div></div>
      <div class="chart-box"><h3>Ventas por Categoría</h3><canvas id="chartCategoria"></canvas></div>
    </div>`;
  refreshIcons();

  const palette=['#e87ea3','#5cb85c','#8b5e3c','#5dade2','#f0a500','#f4a7c1','#c49a6c'];

  if(charts.ventas30)charts.ventas30.destroy();
  const c1=document.getElementById('chartVentas30');
  if(c1&&d.ventasPorDia){
    charts.ventas30=new Chart(c1,{type:'line',data:{labels:d.ventasPorDia.map(v=>{const p=v.fecha.split('-');return p[2]+'/'+p[1];}),datasets:[{label:'Ventas',data:d.ventasPorDia.map(v=>v.total),borderColor:'#e87ea3',backgroundColor:'rgba(232,126,163,.08)',fill:true,tension:.4,pointRadius:0,pointHitRadius:10,borderWidth:2.5}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#b8a098',maxTicksLimit:8}},y:{beginAtZero:true,grid:{color:'rgba(240,221,214,.5)'},ticks:{color:'#b8a098'}}}}});
  }
  if(charts.metodoPago)charts.metodoPago.destroy();
  const c2=document.getElementById('chartMetodoPago');
  if(c2&&d.metodoPagoDistribucion){
    const mp=d.metodoPagoDistribucion;
    charts.metodoPago=new Chart(c2,{type:'doughnut',data:{labels:Object.keys(mp),datasets:[{data:Object.values(mp),backgroundColor:palette,borderWidth:0}]},options:{responsive:true,cutout:'72%',plugins:{legend:{position:'bottom',labels:{color:'#8b6f66',padding:14,usePointStyle:true,pointStyleWidth:10}}}}});
  }
  const tp=document.getElementById('topProductosTable');
  if(tp&&d.topProductos&&d.topProductos.length){
    const mx=Math.max(...d.topProductos.map(p=>p.cantidad));
    tp.innerHTML=d.topProductos.map((p,i)=>`<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;font-size:.86rem;margin-bottom:6px"><span><span style="background:var(--grad-warm);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:800;margin-right:6px">#${i+1}</span>${p.nombre}</span><span style="font-weight:700;color:var(--brown)">${p.cantidad} uds &middot; ${formatearMoneda(p.monto)}</span></div><div class="progress"><div class="progress-bar" style="width:${p.cantidad/mx*100}%"></div></div></div>`).join('');
  }else if(tp){tp.innerHTML='<div class="empty-state"><p>Sin datos</p></div>';}

  if(charts.categoria)charts.categoria.destroy();
  const c3=document.getElementById('chartCategoria');
  if(c3&&d.ventasPorCategoria&&Object.keys(d.ventasPorCategoria).length){
    charts.categoria=new Chart(c3,{type:'doughnut',data:{labels:Object.keys(d.ventasPorCategoria),datasets:[{data:Object.values(d.ventasPorCategoria),backgroundColor:palette,borderWidth:0}]},options:{responsive:true,cutout:'72%',plugins:{legend:{position:'bottom',labels:{color:'#8b6f66',padding:14,usePointStyle:true,pointStyleWidth:10}}}}});
  }
}

// ═══════════════════════════════════════════════
// POS
// ═══════════════════════════════════════════════
async function renderPOS(){
  await cargarDatos('productos','getProductos');
  await cargarDatos('clientes','getClientes');
  await cargarDatos('config','getConfig');
  const sec=document.getElementById('sec-pos');
  sec.innerHTML=`
    <div class="pos-layout">
      <div class="pos-products">
        <div style="position:relative"><i data-lucide="search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--text-muted)"></i>
        <input type="text" id="posBuscar" placeholder="Buscar producto..." oninput="filtrarProductosPOS()" style="padding-left:38px"></div>
        <div class="product-grid" id="posGrid"></div>
      </div>
      <div class="pos-cart">
        <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:4px;color:var(--brown)"><i data-lucide="shopping-cart" style="width:20px;height:20px;color:var(--pink)"></i> Carrito</h3>
        <div class="cart-items" id="cartItems"><div class="empty-state"><i data-lucide="shopping-bag"></i><p>Agrega productos</p></div></div>
        <div class="cart-totals" id="cartTotals"></div>
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
          <div class="form-row">
            <div class="form-group"><label>Cliente</label><select id="posCliente"><option value="">Consumidor Final</option></select></div>
            <div class="form-group"><label>Método de Pago</label><select id="posMetodo" onchange="posMetodoChange()"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Crédito</option></select></div>
          </div>
          <div id="posEfectivoWrap" style="display:none" class="form-group"><label>Monto Recibido</label><input type="number" id="posRecibido" oninput="calcularCambio()" placeholder="0.00"><div id="posCambio" style="font-size:1.1rem;font-weight:700;margin-top:6px"></div></div>
          <div class="form-group"><label>Descuento</label><div style="display:flex;gap:8px"><input type="number" id="posDescuento" value="0" oninput="actualizarCarrito()" style="flex:1"><select id="posDescTipo" onchange="actualizarCarrito()" style="width:auto"><option value="fijo">RD$</option><option value="pct">%</option></select></div></div>
          <div class="form-group"><label>Notas</label><input type="text" id="posNotas" placeholder="Notas opcionales..."></div>
          <button class="btn btn-primary btn-lg btn-block" onclick="registrarVentaPOS()"><i data-lucide="check-circle" style="width:20px;height:20px"></i> Registrar Venta</button>
        </div>
      </div>
    </div>`;
  const sel=document.getElementById('posCliente');
  (state.clientes||[]).forEach(c=>{const o=document.createElement('option');o.value=c.ID;o.textContent=c.Nombre+' — '+c.Telefono;sel.appendChild(o);});
  filtrarProductosPOS(); actualizarCarrito(); refreshIcons();
}

function filtrarProductosPOS(){
  const q=(document.getElementById('posBuscar')?.value||'').toLowerCase();
  const grid=document.getElementById('posGrid');if(!grid)return;
  const prods=(state.productos||[]).filter(p=>!q||p.Nombre.toLowerCase().includes(q)||(p['Categoría']||'').toLowerCase().includes(q));
  const cats={};prods.forEach(p=>{const c=p['Categoría']||'General';if(!cats[c])cats[c]=[];cats[c].push(p);});
  let html='';
  for(let cat in cats){
    html+=`<div class="cat-divider">${cat}</div>`;
    cats[cat].forEach(p=>{
      const dis=(parseInt(p.Stock)||0)<=0?'opacity:.4;pointer-events:none;':'';
      const imgHtml=p.ImagenURL?`<img class="prod-thumb" src="${p.ImagenURL}" onerror="this.style.display='none'" alt="">`:'';
      html+=`<div class="product-btn" style="${dis}" onclick='agregarAlCarrito(${JSON.stringify({id:p.ID,nombre:p.Nombre,precio:p.Precio,stock:p.Stock})})'>${imgHtml}<div class="name">${p.Nombre}</div><div class="price">${formatearMoneda(p.Precio)}</div><div class="stock-info">Stock: ${p.Stock}</div></div>`;
    });
  }
  grid.innerHTML=html||'<div class="empty-state" style="grid-column:1/-1"><p>No hay productos</p></div>';
}

function agregarAlCarrito(prod){
  const exist=state.carrito.find(i=>i.productoId===prod.id);
  if(exist){if(exist.cantidad<parseInt(prod.stock))exist.cantidad++;else{mostrarToast('Stock insuficiente','warning');return;}}
  else state.carrito.push({productoId:prod.id,nombre:prod.nombre,precio:parseFloat(prod.precio),cantidad:1,maxStock:parseInt(prod.stock)});
  actualizarCarrito();
}
function actualizarCarrito(){
  const div=document.getElementById('cartItems'),totDiv=document.getElementById('cartTotals');if(!div||!totDiv)return;
  if(!state.carrito.length){div.innerHTML='<div class="empty-state"><p>Agrega productos</p></div>';totDiv.innerHTML='';return;}
  div.innerHTML=state.carrito.map((item,i)=>`<div class="cart-item"><div class="item-name">${item.nombre}</div><div class="qty-ctrl"><button onclick="cambiarQty(${i},-1)">−</button><input type="number" value="${item.cantidad}" min="1" max="${item.maxStock}" onchange="setQty(${i},this.value)"><button onclick="cambiarQty(${i},1)">+</button></div><div class="item-sub">${formatearMoneda(item.precio*item.cantidad)}</div><button class="item-del" onclick="eliminarItem(${i})"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>`).join('');
  const descInput=parseFloat(document.getElementById('posDescuento')?.value)||0;
  const descTipo=document.getElementById('posDescTipo')?.value||'fijo';
  const sub=state.carrito.reduce((s,i)=>s+i.precio*i.cantidad,0);
  const desc=descTipo==='pct'?Math.round(sub*(descInput/100)*100)/100:descInput;
  const t=calcularTotalesCarrito(state.carrito,desc);
  totDiv.innerHTML=`<div class="total-row"><span>Subtotal</span><span>${formatearMoneda(t.subtotal)}</span></div><div class="total-row"><span>Descuento</span><span>-${formatearMoneda(desc)}</span></div><div class="total-row"><span>ITBIS (${(state.config&&state.config.ITBIS_Porcentaje)||18}%)</span><span>${formatearMoneda(t.itbis)}</span></div><div class="total-row grand"><span>TOTAL</span><span>${formatearMoneda(t.total)}</span></div>`;
  calcularCambio(); refreshIcons();
}
function cambiarQty(i,delta){const item=state.carrito[i];const nq=item.cantidad+delta;if(nq<1)return;if(nq>item.maxStock){mostrarToast('Stock insuficiente','warning');return;}item.cantidad=nq;actualizarCarrito();}
function setQty(i,val){state.carrito[i].cantidad=Math.max(1,Math.min(parseInt(val)||1,state.carrito[i].maxStock));actualizarCarrito();}
function eliminarItem(i){state.carrito.splice(i,1);actualizarCarrito();}
function posMetodoChange(){document.getElementById('posEfectivoWrap').style.display=document.getElementById('posMetodo')?.value==='Efectivo'?'block':'none';}
function calcularCambio(){const t=calcularTotalesCarrito(state.carrito,getDescuentoPOS());const r=parseFloat(document.getElementById('posRecibido')?.value)||0;const c=r-t.total;const div=document.getElementById('posCambio');if(div)div.innerHTML=r>0?`Cambio: <span style="color:${c>=0?'var(--green)':'var(--red)'}">${formatearMoneda(c)}</span>`:'';}
function getDescuentoPOS(){const v=parseFloat(document.getElementById('posDescuento')?.value)||0;const t=document.getElementById('posDescTipo')?.value||'fijo';const sub=state.carrito.reduce((s,i)=>s+i.precio*i.cantidad,0);return t==='pct'?Math.round(sub*(v/100)*100)/100:v;}

async function registrarVentaPOS(){
  if(!state.carrito.length){mostrarToast('Carrito vacío','warning');return;}
  const cSel=document.getElementById('posCliente');const cId=cSel?.value||'';
  const cNom=cId?cSel.options[cSel.selectedIndex].textContent.split(' — ')[0]:'Consumidor Final';
  const cOpt=cId?cSel.options[cSel.selectedIndex]:null;
  const cTel=cOpt?.dataset?.tel||'';
  const cEmail=cOpt?.dataset?.email||'';
  const mp=document.getElementById('posMetodo')?.value||'Efectivo';
  const desc=getDescuentoPOS();
  const notas=document.getElementById('posNotas')?.value||'';
  // Guardar snapshot del carrito ANTES de limpiar — se usa para pre-llenar la factura
  const itemsSnapshot=state.carrito.map(i=>({productoId:i.productoId,nombre:i.nombre,precio:i.precio,cantidad:i.cantidad}));
  try{mostrarBusy('Registrando venta...');
    const r=await apiPost('registrarVenta',{clienteId:cId,clienteNombre:cNom,metodoPago:mp,descuento:desc,notas:notas,items:itemsSnapshot});
    state.carrito=[];state.productos=null;
    // Invalidar caches afectados por la venta
    invalidarCache('ventas','dashboard','productos');
    // Guardar datos de la última venta para uso en "Generar Factura"
    window._ultimaVenta={
      ventaId:r.id, clienteId:cId, clienteNombre:cNom,
      clienteTelefono:cTel, clienteEmail:cEmail,
      items:itemsSnapshot, descuento:desc, notas:notas
    };
    mostrarToast('Venta registrada');
    mostrarModal(`<h2><i data-lucide="check-circle" style="width:22px;height:22px;color:var(--green)"></i> Venta Registrada</h2>
      <div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary)"><span>Cliente</span><span style="color:var(--text-primary);font-weight:600">${r.clienteNombre}</span></div><div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary)"><span>Método</span><span style="color:var(--text-primary);font-weight:600">${r.metodoPago}</span></div><div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary)"><span>Subtotal</span><span>${formatearMoneda(r.subtotal)}</span></div><div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary)"><span>Descuento</span><span>-${formatearMoneda(r.descuento)}</span></div><div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-secondary)"><span>ITBIS</span><span>${formatearMoneda(r.itbis)}</span></div><div style="display:flex;justify-content:space-between;padding:12px 0;font-size:1.4rem;font-weight:800;color:var(--green);border-top:3px solid var(--green-dim);margin-top:6px"><span>TOTAL</span><span>${formatearMoneda(r.total)}</span></div></div>
      <div style="display:flex;flex-direction:column;gap:8px"><button class="btn btn-primary btn-block" onclick="generarFacturaDesdeVenta()"><i data-lucide="file-text" style="width:18px;height:18px"></i> Generar Factura</button><button class="btn btn-outline btn-block" onclick="cerrarModal()">Solo Registrar</button></div>`);
    refreshIcons();
  }catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}
}

async function generarFacturaDesdeVenta(){
  const v=window._ultimaVenta;
  if(!v){ mostrarToast('No hay datos de la venta','warning'); return; }
  cerrarModal();
  navegarA('facturas');
  // Esperar a que la sección se renderice, luego abrir el modal con todos los datos
  setTimeout(()=>abrirModalFactura(null,v),350);
}

// ═══════════════════════════════════════════════
// FACTURAS
// ═══════════════════════════════════════════════
async function renderFacturas(){
  await cargarDatos('facturas','getFacturas');
  const sec=document.getElementById('sec-facturas');
  sec.innerHTML=`<div class="table-wrap"><div class="table-header"><h3><i data-lucide="file-text" style="width:20px;height:20px;color:var(--pink)"></i> Facturas</h3><div class="table-actions"><select id="filtroEstadoFac" onchange="filtrarFacturas()"><option>Todas</option><option>Pendiente</option><option>Pagada</option><option>Vencida</option><option>Cancelada</option></select><button class="btn btn-primary btn-sm" onclick="abrirModalFactura()"><i data-lucide="plus" style="width:16px;height:16px"></i> Nueva</button></div></div><div style="overflow-x:auto"><table><thead><tr><th>N° Factura</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="facturasBody"></tbody></table></div></div>`;
  filtrarFacturas();refreshIcons();
}
function filtrarFacturas(){
  const est=document.getElementById('filtroEstadoFac')?.value||'Todas';
  const facts=(state.facturas||[]).filter(f=>est==='Todas'||f.Estado===est);
  const tb=document.getElementById('facturasBody');if(!tb)return;
  tb.innerHTML=facts.length?facts.map(f=>`<tr><td><strong style="color:var(--pink)">${f.NumeroFactura}</strong></td><td>${formatearFecha(f.Fecha)}</td><td>${f.ClienteNombre}</td><td><strong>${formatearMoneda(f.Total)}</strong></td><td>${badgeEstado(f.Estado)}</td><td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onclick="verFactura('${f.ID}')"><i data-lucide="eye" style="width:14px;height:14px"></i></button> ${f.Estado==='Pendiente'?`<button class="btn btn-success btn-sm" onclick="marcarFacturaPagada('${f.ID}')"><i data-lucide="check" style="width:14px;height:14px"></i></button>`:''}</td></tr>`).join(''):'<tr><td colspan="6"><div class="empty-state"><p>No hay facturas</p></div></td></tr>';
  refreshIcons();
}
async function abrirModalFactura(fId,prefill){
  await cargarDatos('productos','getProductos');await cargarDatos('clientes','getClientes');await cargarDatos('config','getConfig');
  const hoy=hoyStr(),venc=new Date(Date.now()+30*86400000).toISOString().split('T')[0];
  let cOpts='<option value="">Seleccionar...</option>';
  (state.clientes||[]).forEach(c=>{cOpts+=`<option value="${c.ID}" data-tel="${c.Telefono||''}" data-email="${c.Email||''}" data-nombre="${c.Nombre}" ${prefill&&prefill.clienteId===c.ID?'selected':''}>${c.Nombre} — ${c.Telefono||''}</option>`;});
  const vieneDeVenta = !!(prefill && prefill.items && prefill.items.length);
  const banner = vieneDeVenta
    ? `<div style="background:var(--green-dim);border-left:3px solid var(--green);padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:.88rem;color:var(--text-primary)"><i data-lucide="check-circle" style="width:16px;height:16px;vertical-align:middle;color:var(--green)"></i> Datos de la venta pre-cargados. Revisa y guarda.</div>`
    : '';
  mostrarModal(`<h2><i data-lucide="file-plus" style="width:20px;height:20px;color:var(--pink)"></i> ${fId?'Editar':'Nueva'} Factura</h2>${banner}<div class="form-row"><div class="form-group"><label>Cliente</label><select id="facCliente">${cOpts}</select></div><div class="form-group"><label>Fecha</label><input type="date" id="facFecha" value="${hoy}"></div></div><div class="form-group"><label>Vencimiento</label><input type="date" id="facVenc" value="${venc}"></div><h3 style="margin:16px 0 10px;font-size:.9rem;color:var(--brown)">Items</h3><div id="facItems"></div><button class="btn btn-outline btn-sm" onclick="facAgregarItem()" style="margin-top:8px"><i data-lucide="plus" style="width:14px;height:14px"></i> Agregar</button><div style="margin-top:16px;text-align:right" id="facTotales"></div><div class="form-group" style="margin-top:16px"><label>Notas</label><textarea id="facNotas" rows="2">${(prefill&&prefill.notas)||''}</textarea></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-primary" onclick="guardarFactura(false)"><i data-lucide="save" style="width:16px;height:16px"></i> Guardar</button><button class="btn btn-secondary" onclick="guardarFactura(true)"><i data-lucide="eye" style="width:16px;height:16px"></i> Guardar y Ver</button></div><input type="hidden" id="facVentaId" value="${(prefill&&prefill.ventaId)||''}"><input type="hidden" id="facDescuento" value="${(prefill&&prefill.descuento)||0}">`,'modal-lg');

  // Pre-cargar items: si viene de una venta, usa sus items; si no, añade uno vacío
  if(vieneDeVenta){
    window._facItems = prefill.items.map(it=>({
      productoId: it.productoId||'',
      descripcion: it.nombre||it.descripcion||'',
      cantidad: parseInt(it.cantidad)||1,
      precio: parseFloat(it.precio||it.precioUnitario)||0
    }));
    renderFacItems();
  } else {
    window._facItems=[];
    facAgregarItem();
  }
  refreshIcons();
}
function facAgregarItem(){window._facItems.push({productoId:'',descripcion:'',cantidad:1,precio:0});renderFacItems();}
function renderFacItems(){
  const div=document.getElementById('facItems');if(!div)return;
  div.innerHTML=window._facItems.map((item,i)=>{
    let opts='<option value="">Libre...</option>';
    (state.productos||[]).forEach(p=>{opts+=`<option value="${p.ID}" data-precio="${p.Precio}" ${item.productoId===p.ID?'selected':''}>${p.Nombre} — ${formatearMoneda(p.Precio)}</option>`;});
    return`<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:end"><div style="flex:2;min-width:140px"><select onchange="facItemProdChange(${i},this)">${opts}</select></div><div style="flex:2;min-width:100px"><input placeholder="Descripción" value="${item.descripcion}" onchange="window._facItems[${i}].descripcion=this.value"></div><div style="flex:1;min-width:55px"><input type="number" value="${item.cantidad}" min="1" onchange="window._facItems[${i}].cantidad=parseInt(this.value)||1;calcFacTotales()"></div><div style="flex:1;min-width:75px"><input type="number" value="${item.precio}" step="0.01" onchange="window._facItems[${i}].precio=parseFloat(this.value)||0;calcFacTotales()"></div><div style="min-width:80px;text-align:right;font-weight:700;color:var(--green);font-size:.88rem">${formatearMoneda(item.precio*item.cantidad)}</div><button class="btn btn-danger btn-sm" onclick="window._facItems.splice(${i},1);renderFacItems()"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div>`;
  }).join('');calcFacTotales();refreshIcons();
}
function facItemProdChange(i,sel){const o=sel.options[sel.selectedIndex];if(o.value){window._facItems[i].productoId=o.value;window._facItems[i].precio=parseFloat(o.dataset.precio)||0;window._facItems[i].descripcion=o.textContent.split(' — ')[0];}else window._facItems[i].productoId='';renderFacItems();}
function calcFacTotales(){const sub=window._facItems.reduce((s,i)=>s+i.precio*i.cantidad,0);const pct=(state.config&&parseFloat(state.config.ITBIS_Porcentaje))||18;const itbis=Math.round(sub*(pct/100)*100)/100;const div=document.getElementById('facTotales');if(div)div.innerHTML=`<div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--text-secondary)"><span>Subtotal</span><span>${formatearMoneda(sub)}</span></div><div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--text-secondary)"><span>ITBIS (${pct}%)</span><span>${formatearMoneda(itbis)}</span></div><div style="display:flex;justify-content:space-between;padding:10px 0;font-size:1.3rem;font-weight:800;color:var(--green);border-top:3px solid var(--green-dim);margin-top:4px"><span>TOTAL</span><span>${formatearMoneda(sub+itbis)}</span></div>`;}
async function guardarFactura(preview){
  const sel=document.getElementById('facCliente'),opt=sel.options[sel.selectedIndex];const items=window._facItems.filter(i=>i.descripcion||i.productoId);
  if(!items.length){mostrarToast('Agrega al menos un item','warning');return;}
  try{mostrarBusy('Guardando factura...');const r=await apiPost('crearFactura',{clienteId:sel.value,clienteNombre:opt?.dataset?.nombre||'',clienteTelefono:opt?.dataset?.tel||'',clienteEmail:opt?.dataset?.email||'',fecha:document.getElementById('facFecha')?.value,fechaVencimiento:document.getElementById('facVenc')?.value,notas:document.getElementById('facNotas')?.value||'',ventaId:document.getElementById('facVentaId')?.value||'',descuento:parseFloat(document.getElementById('facDescuento')?.value)||0,items:items.map(i=>({productoId:i.productoId,descripcion:i.descripcion,nombre:i.descripcion,cantidad:i.cantidad,precio:i.precio,precioUnitario:i.precio}))});invalidarCache('facturas','dashboard');mostrarToast('Factura '+r.numeroFactura+' creada');cerrarModal();window._ultimaVenta=null;if(preview)verFacturaData(r);else renderFacturas();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}
}
async function verFactura(id){try{mostrarBusy('Cargando factura...');const facs=await cargarDatos('facturas','getFacturas');const f=facs.find(x=>x.ID===id);if(!f){mostrarToast('No encontrada','error');return;}const det=await apiGet('getDetalleFactura',{facturaId:id});await cargarDatos('config','getConfig');renderFacturaPreview(f,det);}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}
function verFacturaData(r){const f={NumeroFactura:r.numeroFactura,Fecha:r.fecha,FechaVencimiento:r.fechaVencimiento,ClienteNombre:r.clienteNombre,ClienteTelefono:r.clienteTelefono,ClienteEmail:r.clienteEmail,Subtotal:r.subtotal,Descuento:r.descuento||0,ITBIS:r.itbis,Total:r.total,Estado:'Pendiente',Notas:'',ID:r.id};const det=(r.items||[]).map(i=>({Descripcion:i.descripcion||i.nombre,Cantidad:i.cantidad,PrecioUnitario:i.precio||i.precioUnitario,Subtotal:(i.precio||i.precioUnitario)*i.cantidad}));renderFacturaPreview(f,det);}

function renderFacturaPreview(fac,detalles){
  const cfg=state.config||{};
  document.getElementById('sec-facturas').innerHTML=`
    <div class="no-print" style="margin-bottom:20px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline" onclick="renderFacturas()"><i data-lucide="arrow-left" style="width:16px;height:16px"></i> Volver</button>
      <button class="btn btn-warm" onclick="enviarFacturaWhatsApp()"><i data-lucide="message-circle" style="width:16px;height:16px"></i> WhatsApp</button>
      <button class="btn btn-outline" onclick="copiarMensajeFactura()"><i data-lucide="copy" style="width:16px;height:16px"></i> Copiar</button>
      <button class="btn btn-outline" onclick="window.print()"><i data-lucide="printer" style="width:16px;height:16px"></i> Imprimir</button>
      ${fac.Estado==='Pendiente'?`<button class="btn btn-success" onclick="marcarFacturaPagada('${fac.ID}')"><i data-lucide="check-circle" style="width:16px;height:16px"></i> Pagada</button>`:''}
    </div>
    <div class="factura-preview"><div class="fac-header"><div>${cfg.Logo?`<img src="${cfg.Logo}" style="max-height:60px;margin-bottom:10px" alt="Logo">`:''}<h1>${cfg.NombreNegocio||'Mi Negocio'}</h1>${cfg.RNC?`<div style="color:var(--text-muted);font-size:.86rem">RNC: ${cfg.RNC}</div>`:''}${cfg.Direccion?`<div style="color:var(--text-muted);font-size:.86rem">${cfg.Direccion}</div>`:''}${cfg.Telefono?`<div style="color:var(--text-muted);font-size:.86rem">Tel: ${cfg.Telefono}</div>`:''}</div><div style="text-align:right"><div class="fac-num">${fac.NumeroFactura}</div><div style="color:var(--text-secondary);margin-top:6px;font-size:.88rem">Fecha: ${formatearFecha(fac.Fecha)}</div><div style="color:var(--text-secondary);font-size:.88rem">Vence: ${formatearFecha(fac.FechaVencimiento)}</div><div style="margin-top:8px">${badgeEstado(fac.Estado)}</div></div></div>
    <div class="fac-info"><div><strong>Facturado a:</strong><br>${fac.ClienteNombre||'—'}<br>${fac.ClienteTelefono?'Tel: '+fac.ClienteTelefono+'<br>':''}${fac.ClienteEmail||''}</div></div>
    <table><thead><tr><th>Descripción</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Total</th></tr></thead><tbody>${detalles.map(d=>`<tr><td>${d.Descripcion||''}</td><td style="text-align:center">${d.Cantidad}</td><td style="text-align:right">${formatearMoneda(d.PrecioUnitario)}</td><td style="text-align:right">${formatearMoneda(d.Subtotal)}</td></tr>`).join('')}</tbody></table>
    <div class="fac-totals"><div class="row">Subtotal: ${formatearMoneda(fac.Subtotal)}</div>${fac.Descuento?`<div class="row">Descuento: -${formatearMoneda(fac.Descuento)}</div>`:''}<div class="row">ITBIS (${cfg.ITBIS_Porcentaje||18}%): ${formatearMoneda(fac.ITBIS)}</div><div class="row grand">TOTAL: ${formatearMoneda(fac.Total)}</div></div>
    <div class="fac-footer">${fac.Notas?`<p>${fac.Notas}</p>`:''}<p>Gracias por su preferencia</p><p>${cfg.NombreNegocio||''} | ${cfg.Telefono||''}</p></div></div>`;
  window._currentFactura=fac;window._currentFacturaDetalles=detalles;refreshIcons();
}
function buildMensajeFactura(){const f=window._currentFactura,d=window._currentFacturaDetalles,cfg=state.config||{};if(!f)return'';return`Estimado/a ${f.ClienteNombre},\n\nLe adjuntamos su factura:\n\n📋 *Factura N°:* ${f.NumeroFactura}\n📅 *Fecha:* ${formatearFecha(f.Fecha)}\n⏰ *Vencimiento:* ${formatearFecha(f.FechaVencimiento)}\n\n📦 *Detalle:*\n${d.map(i=>`• ${i.Descripcion||i.descripcion} x ${i.Cantidad||i.cantidad} = ${formatearMoneda((i.PrecioUnitario||i.precioUnitario)*(i.Cantidad||i.cantidad))}`).join('\n')}\n\n💰 *Subtotal:* ${formatearMoneda(f.Subtotal)}\n💰 *ITBIS (${cfg.ITBIS_Porcentaje||18}%):* ${formatearMoneda(f.ITBIS)}\n✅ *TOTAL:* ${formatearMoneda(f.Total)}\n\n_${cfg.NombreNegocio||'Mi Negocio'} | ${cfg.Telefono||''}_`;}
function enviarFacturaWhatsApp(){const f=window._currentFactura;if(!f)return;let t=String(f.ClienteTelefono||'').replace(/\D/g,'');if(t.length===10)t='1'+t;if(!t){mostrarToast('Sin teléfono','warning');return;}window.open('https://wa.me/'+t+'?text='+encodeURIComponent(buildMensajeFactura()),'_blank');}
function copiarMensajeFactura(){navigator.clipboard.writeText(buildMensajeFactura()).then(()=>mostrarToast('Copiado')).catch(()=>mostrarToast('Error','error'));}
async function marcarFacturaPagada(id){try{mostrarBusy('Actualizando factura...');await apiPost('actualizarEstadoFactura',{id,estado:'Pagada'});invalidarCache('facturas','dashboard');state.facturas=null;mostrarToast('Factura pagada');renderFacturas();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}

// ═══════════════════════════════════════════════
// INVENTARIO — con upload de imágenes
// ═══════════════════════════════════════════════
async function renderInventario(){
  await cargarDatos('productos','getProductos');const prods=state.productos||[];
  const sec=document.getElementById('sec-inventario');
  const valorInv=prods.reduce((s,p)=>(parseInt(p.Stock)||0)*(parseFloat(p.Costo)||0)+s,0);
  const stockBajo=prods.filter(p=>(parseInt(p.Stock)||0)<=(parseInt(p.StockMinimo)||0)).length;
  const cats=[...new Set(prods.map(p=>p['Categoría']||'Sin categoría'))];
  sec.innerHTML=`
    <div class="cards">
      <div class="card"><div class="card-icon pink"><i data-lucide="package"></i></div><div class="card-label">Total Productos</div><div class="card-value">${prods.length}</div></div>
      <div class="card"><div class="card-icon blue"><i data-lucide="banknote"></i></div><div class="card-label">Valor Inventario</div><div class="card-value text-blue">${formatearMoneda(valorInv)}</div></div>
      <div class="card"><div class="card-icon red"><i data-lucide="alert-triangle"></i></div><div class="card-label">Stock Bajo</div><div class="card-value text-red">${stockBajo}</div></div>
      <div class="card"><div class="card-icon green"><i data-lucide="layers"></i></div><div class="card-label">Categorías</div><div class="card-value text-green">${cats.length}</div></div>
    </div>
    <div class="table-wrap"><div class="table-header"><h3><i data-lucide="package" style="width:20px;height:20px;color:var(--pink)"></i> Productos</h3><div class="table-actions">
      <div style="position:relative"><i data-lucide="search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--text-muted)"></i><input type="text" class="search-input" placeholder="Buscar..." id="invBuscar" oninput="filtrarInventario()" style="padding-left:34px"></div>
      <select id="invCatFiltro" onchange="filtrarInventario()"><option value="">Todas</option>${cats.map(c=>`<option>${c}</option>`).join('')}</select>
      <select id="invStockFiltro" onchange="filtrarInventario()"><option value="">Todo</option><option value="bajo">Bajo</option><option value="agotado">Agotado</option><option value="normal">Normal</option></select>
      <button class="btn btn-primary btn-sm" onclick="abrirModalProducto()"><i data-lucide="plus" style="width:16px;height:16px"></i> Nuevo</button>
    </div></div><div style="overflow-x:auto"><table><thead><tr><th></th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Mín</th><th>Precio</th><th>Costo</th><th>Margen</th><th>Acciones</th></tr></thead><tbody id="invBody"></tbody></table></div></div>`;
  filtrarInventario();refreshIcons();
}
function filtrarInventario(){
  const q=(document.getElementById('invBuscar')?.value||'').toLowerCase();const cat=document.getElementById('invCatFiltro')?.value||'';const stk=document.getElementById('invStockFiltro')?.value||'';
  let prods=state.productos||[];if(q)prods=prods.filter(p=>p.Nombre.toLowerCase().includes(q));if(cat)prods=prods.filter(p=>(p['Categoría']||'')===cat);
  if(stk==='bajo')prods=prods.filter(p=>(parseInt(p.Stock)||0)<=(parseInt(p.StockMinimo)||0)&&(parseInt(p.Stock)||0)>0);if(stk==='agotado')prods=prods.filter(p=>(parseInt(p.Stock)||0)<=0);if(stk==='normal')prods=prods.filter(p=>(parseInt(p.Stock)||0)>(parseInt(p.StockMinimo)||0));
  const tb=document.getElementById('invBody');if(!tb)return;
  tb.innerHTML=prods.map(p=>{const g=parseFloat(p.Costo)>0?Math.round((parseFloat(p.Precio)-parseFloat(p.Costo))/parseFloat(p.Costo)*100):0;const sc=(parseInt(p.Stock)||0)<=(parseInt(p.StockMinimo)||0)?'color:var(--red);font-weight:700':'';
    const imgCell=p.ImagenURL?`<img class="prod-img-cell" src="${p.ImagenURL}" onerror="this.outerHTML='<div class=\\'prod-img-placeholder\\'><i data-lucide=\\'image\\' style=\\'width:18px;height:18px\\'></i></div>'" alt="">`:'<div class="prod-img-placeholder"><i data-lucide="image" style="width:18px;height:18px"></i></div>';
    return`<tr><td>${imgCell}</td><td><strong>${p.Nombre}</strong></td><td><span class="badge badge-pink">${p['Categoría']||''}</span></td><td style="${sc}">${p.Stock}</td><td>${p.StockMinimo}</td><td>${formatearMoneda(p.Precio)}</td><td>${formatearMoneda(p.Costo)}</td><td><span class="badge ${g>30?'badge-green':g>15?'badge-yellow':'badge-red'}">${g}%</span></td><td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onclick="abrirModalProducto('${p.ID}')"><i data-lucide="edit-3" style="width:14px;height:14px"></i></button> <button class="btn btn-outline btn-sm" onclick="ajustarInventario('${p.ID}','${p.Nombre.replace(/'/g,"\\'")}',${p.Stock})"><i data-lucide="package-plus" style="width:14px;height:14px"></i></button> <button class="btn btn-danger btn-sm" onclick="eliminarProducto('${p.ID}')"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></td></tr>`;
  }).join('')||'<tr><td colspan="9"><div class="empty-state"><p>No hay productos</p></div></td></tr>';refreshIcons();
}
function abrirModalProducto(id){
  const prod=id?(state.productos||[]).find(p=>p.ID===id):null;
  const cats=[...new Set((state.productos||[]).map(p=>p['Categoría']).filter(Boolean))];
  const prevImg=prod?.ImagenURL||'';
  mostrarModal(`<h2><i data-lucide="${prod?'edit-3':'plus-circle'}" style="width:20px;height:20px;color:var(--pink)"></i> ${prod?'Editar':'Nuevo'} Producto</h2>
    <div class="form-row"><div class="form-group"><label>Nombre</label><input id="prodNombre" value="${prod?.Nombre||''}"></div><div class="form-group"><label>Categoría</label><select id="prodCat"><option value="">Seleccionar...</option>${cats.map(c=>`<option ${prod&&prod['Categoría']===c?'selected':''}>${c}</option>`).join('')}<option value="__nueva">+ Nueva</option></select><input id="prodCatNueva" style="display:none;margin-top:6px" placeholder="Nueva categoría"></div></div>
    <div class="form-row"><div class="form-group"><label>Precio Venta</label><input type="number" id="prodPrecio" value="${prod?.Precio||''}"></div><div class="form-group"><label>Costo</label><input type="number" id="prodCosto" value="${prod?.Costo||''}"></div></div>
    <div class="form-row"><div class="form-group"><label>Stock</label><input type="number" id="prodStock" value="${prod?.Stock||0}"></div><div class="form-group"><label>Stock Mínimo</label><input type="number" id="prodStockMin" value="${prod?.StockMinimo||0}"></div></div>
    <div class="form-group"><label>Descripción</label><textarea id="prodDesc" rows="2">${prod?.Descripcion||''}</textarea></div>
    <div class="form-group"><label>Imagen del Producto</label>
      <div class="img-upload-area ${prevImg?'has-image':''}" id="imgUploadArea" onclick="document.getElementById('prodFileInput').click()">
        <input type="file" id="prodFileInput" accept="image/*" onchange="previewProductImage(this)" style="position:absolute;inset:0;opacity:0;cursor:pointer">
        <img id="prodImgPrev" src="${prevImg}" style="max-height:100px;border-radius:var(--radius-sm);display:${prevImg?'block':'none'};margin:0 auto 8px" onerror="this.style.display='none'">
        <div class="upload-text" id="uploadText" style="display:${prevImg?'none':'block'}"><i data-lucide="upload-cloud"></i><span>Haz clic o arrastra una imagen</span><br><small style="color:var(--text-muted)">JPG, PNG, WebP — Máx 2MB</small></div>
      </div>
      <input type="hidden" id="prodImgData" value="${prevImg}">
      ${prevImg?`<button type="button" class="btn btn-outline btn-sm" style="margin-top:8px" onclick="quitarImagenProducto()"><i data-lucide="x" style="width:14px;height:14px"></i> Quitar imagen</button>`:''}
    </div>
    <button class="btn btn-primary btn-block" onclick="guardarProductoModal('${id||''}')">${prod?'Actualizar':'Guardar'}</button>`);
  document.getElementById('prodCat').addEventListener('change',function(){document.getElementById('prodCatNueva').style.display=this.value==='__nueva'?'block':'none';});
  refreshIcons();
}

function previewProductImage(input){
  const file=input.files[0];if(!file)return;
  if(file.size>2*1024*1024){mostrarToast('Máx 2MB','warning');return;}
  const reader=new FileReader();
  reader.onload=function(e){
    document.getElementById('prodImgPrev').src=e.target.result;
    document.getElementById('prodImgPrev').style.display='block';
    document.getElementById('uploadText').style.display='none';
    document.getElementById('imgUploadArea').classList.add('has-image');
    document.getElementById('prodImgData').value=e.target.result;
  };
  reader.readAsDataURL(file);
}

function quitarImagenProducto(){
  document.getElementById('prodImgPrev').src='';
  document.getElementById('prodImgPrev').style.display='none';
  document.getElementById('uploadText').style.display='block';
  document.getElementById('imgUploadArea').classList.remove('has-image');
  document.getElementById('prodImgData').value='';
  document.getElementById('prodFileInput').value='';
}

async function guardarProductoModal(id){
  const catS=document.getElementById('prodCat').value,catN=document.getElementById('prodCatNueva').value;
  let imagenURL=document.getElementById('prodImgData').value||'';

  // Si es base64, intentar subir al sheet
  if(imagenURL.startsWith('data:')){
    try{
      mostrarBusy('Subiendo imagen...');
      const r=await apiPost('subirImagen',{imagen:imagenURL,nombre:'prod_'+Date.now()});
      if(r.url) imagenURL=r.url;
    }catch(e){ /* fallback: usar base64 */ }
    finally{ ocultarBusy(); }
  }

  try{mostrarBusy('Guardando producto...');await apiPost('guardarProducto',{producto:{...(id?{id}:{}),nombre:document.getElementById('prodNombre').value,categoria:catS==='__nueva'?catN:catS,precio:document.getElementById('prodPrecio').value,costo:document.getElementById('prodCosto').value,stock:document.getElementById('prodStock').value,stockMinimo:document.getElementById('prodStockMin').value,descripcion:document.getElementById('prodDesc').value,imagenURL:imagenURL,activo:true}});invalidarCache('productos','dashboard');state.productos=null;cerrarModal();mostrarToast(id?'Actualizado':'Creado');renderInventario();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}
}
async function eliminarProducto(id){if(!confirm('¿Eliminar?'))return;try{mostrarBusy('Eliminando...');await apiPost('eliminarProducto',{id});invalidarCache('productos','dashboard');state.productos=null;mostrarToast('Eliminado');renderInventario();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}
function ajustarInventario(id,nombre,stock){
  mostrarModal(`<h2><i data-lucide="package-plus" style="width:20px;height:20px;color:var(--pink)"></i> Ajustar Inventario</h2><p style="color:var(--text-secondary)"><strong style="color:var(--text-primary)">${nombre}</strong> — Stock: ${stock}</p><div class="form-row" style="margin-top:14px"><div class="form-group"><label>Tipo</label><select id="ajusteTipo"><option value="entrada">+ Entrada</option><option value="salida">- Salida</option></select></div><div class="form-group"><label>Cantidad</label><input type="number" id="ajusteCant" min="1" value="1"></div></div><div class="form-group"><label>Motivo</label><select id="ajusteMotivo"><option>Compra</option><option>Devolución</option><option>Ajuste</option><option>Pérdida</option></select></div><button class="btn btn-primary btn-block" onclick="ejecutarAjuste('${id}',${stock})">Aplicar</button>`);refreshIcons();
}
async function ejecutarAjuste(id,s){const t=document.getElementById('ajusteTipo').value,c=parseInt(document.getElementById('ajusteCant').value)||0,n=t==='entrada'?s+c:s-c;if(n<0){mostrarToast('Stock negativo','warning');return;}try{mostrarBusy('Ajustando inventario...');await apiPost('guardarProducto',{producto:{id,stock:n}});invalidarCache('productos','dashboard');state.productos=null;cerrarModal();mostrarToast('Ajustado');renderInventario();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}

// ═══════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════
async function renderClientes(){
  await cargarDatos('clientes','getClientes');await cargarDatos('ventas','getVentas');await cargarDatos('deudas','getDeudas');
  const sec=document.getElementById('sec-clientes');
  sec.innerHTML=`<div class="table-wrap"><div class="table-header"><h3><i data-lucide="users" style="width:20px;height:20px;color:var(--pink)"></i> Clientes</h3><div class="table-actions"><div style="position:relative"><i data-lucide="search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--text-muted)"></i><input type="text" class="search-input" id="cliBuscar" placeholder="Buscar..." oninput="filtrarClientes()" style="padding-left:34px"></div><button class="btn btn-primary btn-sm" onclick="abrirModalCliente()"><i data-lucide="user-plus" style="width:16px;height:16px"></i> Nuevo</button></div></div><div style="overflow-x:auto"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Compras</th><th>Deuda</th><th>Acciones</th></tr></thead><tbody id="cliBody"></tbody></table></div></div>`;
  filtrarClientes();refreshIcons();
}
function filtrarClientes(){
  const q=(document.getElementById('cliBuscar')?.value||'').toLowerCase();let cls=state.clientes||[];if(q)cls=cls.filter(c=>c.Nombre.toLowerCase().includes(q)||(c.Telefono||'').includes(q));
  const tb=document.getElementById('cliBody');if(!tb)return;
  tb.innerHTML=cls.map(c=>{const comp=(state.ventas||[]).filter(v=>v.ClienteID===c.ID).reduce((s,v)=>s+(parseFloat(v.Total)||0),0);const deud=(state.deudas||[]).filter(d=>d.EntidadID===c.ID&&d.Estado==='Pendiente').reduce((s,d)=>s+(parseFloat(d.SaldoPendiente)||0),0);
    return`<tr><td><strong style="cursor:pointer;color:var(--pink)" onclick="verCliente('${c.ID}')">${c.Nombre}</strong></td><td>${c.Telefono||''}</td><td style="color:var(--text-muted)">${c.Email||''}</td><td>${formatearMoneda(comp)}</td><td>${deud>0?`<span style="color:var(--red);font-weight:700">${formatearMoneda(deud)}</span>`:'—'}</td><td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onclick="verCliente('${c.ID}')"><i data-lucide="eye" style="width:14px;height:14px"></i></button> <button class="btn btn-outline btn-sm" onclick="abrirModalCliente('${c.ID}')"><i data-lucide="edit-3" style="width:14px;height:14px"></i></button> ${c.Telefono?`<button class="btn btn-outline btn-sm" onclick="abrirWhatsApp('${c.Telefono}')"><i data-lucide="message-circle" style="width:14px;height:14px"></i></button>`:''}</td></tr>`;
  }).join('')||'<tr><td colspan="6"><div class="empty-state"><p>No hay clientes</p></div></td></tr>';refreshIcons();
}
function abrirWhatsApp(tel){let t=String(tel).replace(/\D/g,'');if(t.length===10)t='1'+t;window.open('https://wa.me/'+t,'_blank');}
async function verCliente(id){
  const cli=(state.clientes||[]).find(c=>c.ID===id);if(!cli)return;
  await cargarDatos('ventas','getVentas');await cargarDatos('facturas','getFacturas');await cargarDatos('deudas','getDeudas');
  const vCli=(state.ventas||[]).filter(v=>v.ClienteID===id),fCli=(state.facturas||[]).filter(f=>f.ClienteID===id),dCli=(state.deudas||[]).filter(d=>d.EntidadID===id&&d.Tipo==='cliente');
  const sec=document.getElementById('sec-clientes');
  sec.innerHTML=`<button class="btn btn-outline" onclick="renderClientes()" style="margin-bottom:16px"><i data-lucide="arrow-left" style="width:16px;height:16px"></i> Volver</button>
    <div class="client-detail"><div class="client-info"><h3>${cli.Nombre}</h3><div style="margin-top:14px;font-size:.88rem;color:var(--text-secondary);line-height:2">${cli.Telefono?`<div><i data-lucide="phone" style="width:14px;height:14px;vertical-align:middle;margin-right:6px"></i>${cli.Telefono}</div>`:''}${cli.Email?`<div><i data-lucide="mail" style="width:14px;height:14px;vertical-align:middle;margin-right:6px"></i>${cli.Email}</div>`:''}${cli.Direccion?`<div><i data-lucide="map-pin" style="width:14px;height:14px;vertical-align:middle;margin-right:6px"></i>${cli.Direccion}</div>`:''}${cli.RNC?`<div>RNC: ${cli.RNC}</div>`:''}${cli.Notas?`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">${cli.Notas}</div>`:''}</div><div style="margin-top:16px;display:flex;flex-direction:column;gap:8px"><button class="btn btn-outline btn-block btn-sm" onclick="abrirModalCliente('${id}')"><i data-lucide="edit-3" style="width:14px;height:14px"></i> Editar</button>${cli.Telefono?`<button class="btn btn-warm btn-block btn-sm" onclick="abrirWhatsApp('${cli.Telefono}')"><i data-lucide="message-circle" style="width:14px;height:14px"></i> WhatsApp</button>`:''}</div></div>
    <div class="client-history">
      <div class="table-wrap"><div class="table-header"><h3>Ventas (${vCli.length})</h3></div><div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Total</th><th>Método</th><th>Estado</th></tr></thead><tbody>${vCli.map(v=>`<tr><td>${formatearFecha(v.Fecha)}</td><td>${formatearMoneda(v.Total)}</td><td>${v.MetodoPago}</td><td>${badgeEstado(v.Estado)}</td></tr>`).join('')||'<tr><td colspan="4" style="color:var(--text-muted)">Sin ventas</td></tr>'}</tbody></table></div></div>
      <div class="table-wrap"><div class="table-header"><h3>Facturas (${fCli.length})</h3></div><div style="overflow-x:auto"><table><thead><tr><th>N°</th><th>Fecha</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>${fCli.map(f=>`<tr><td style="color:var(--pink)">${f.NumeroFactura}</td><td>${formatearFecha(f.Fecha)}</td><td>${formatearMoneda(f.Total)}</td><td>${badgeEstado(f.Estado)}</td><td><button class="btn btn-outline btn-sm" onclick="navegarA('facturas');setTimeout(()=>verFactura('${f.ID}'),300)"><i data-lucide="eye" style="width:14px;height:14px"></i></button></td></tr>`).join('')||'<tr><td colspan="5" style="color:var(--text-muted)">Sin facturas</td></tr>'}</tbody></table></div></div>
      ${dCli.length?`<div class="table-wrap"><div class="table-header"><h3>Deudas</h3></div><div style="overflow-x:auto"><table><thead><tr><th>Original</th><th>Pagado</th><th>Pendiente</th><th>Estado</th><th></th></tr></thead><tbody>${dCli.map(d=>`<tr><td>${formatearMoneda(d.MontoOriginal)}</td><td>${formatearMoneda(d.MontoPagado)}</td><td style="color:var(--red);font-weight:700">${formatearMoneda(d.SaldoPendiente)}</td><td>${badgeEstado(d.Estado)}</td><td>${d.Estado==='Pendiente'?`<button class="btn btn-success btn-sm" onclick="abrirModalPago('${d.ID}',${d.SaldoPendiente})"><i data-lucide="banknote" style="width:14px;height:14px"></i></button>`:''}</td></tr>`).join('')}</tbody></table></div></div>`:''}
    </div></div>`;refreshIcons();
}
function abrirModalCliente(id){const cli=id?(state.clientes||[]).find(c=>c.ID===id):null;mostrarModal(`<h2><i data-lucide="${cli?'edit-3':'user-plus'}" style="width:20px;height:20px;color:var(--pink)"></i> ${cli?'Editar':'Nuevo'} Cliente</h2><div class="form-row"><div class="form-group"><label>Nombre</label><input id="cliNombre" value="${cli?.Nombre||''}"></div><div class="form-group"><label>Teléfono</label><input id="cliTel" value="${cli?.Telefono||''}"></div></div><div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="cliEmail" value="${cli?.Email||''}"></div><div class="form-group"><label>RNC</label><input id="cliRNC" value="${cli?.RNC||''}"></div></div><div class="form-group"><label>Dirección</label><input id="cliDir" value="${cli?.Direccion||''}"></div><div class="form-group"><label>Notas</label><textarea id="cliNotas" rows="2">${cli?.Notas||''}</textarea></div><button class="btn btn-primary btn-block" onclick="guardarClienteModal('${id||''}')">${cli?'Actualizar':'Guardar'}</button>`);}
async function guardarClienteModal(id){try{mostrarBusy('Guardando cliente...');await apiPost('guardarCliente',{cliente:{...(id?{id}:{}),nombre:document.getElementById('cliNombre').value,telefono:document.getElementById('cliTel').value,email:document.getElementById('cliEmail').value,rnc:document.getElementById('cliRNC').value,direccion:document.getElementById('cliDir').value,notas:document.getElementById('cliNotas').value}});invalidarCache('clientes');state.clientes=null;cerrarModal();mostrarToast(id?'Actualizado':'Creado');renderClientes();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}
function abrirModalPago(did,saldo){mostrarModal(`<h2><i data-lucide="banknote" style="width:20px;height:20px;color:var(--green)"></i> Registrar Pago</h2><p style="color:var(--text-secondary)">Saldo: <strong style="color:var(--red)">${formatearMoneda(saldo)}</strong></p><div class="form-group" style="margin-top:14px"><label>Monto</label><input type="number" id="pagoMonto" value="${saldo}" max="${saldo}" step="0.01"></div><button class="btn btn-primary btn-block" onclick="ejecutarPago('${did}')">Registrar</button>`);refreshIcons();}
async function ejecutarPago(id){const m=parseFloat(document.getElementById('pagoMonto').value)||0;if(m<=0){mostrarToast('Monto inválido','warning');return;}try{mostrarBusy('Registrando pago...');await apiPost('registrarPago',{id,monto:m});invalidarCache('deudas','dashboard');state.deudas=null;cerrarModal();mostrarToast('Pago registrado');renderClientes();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}

// ═══════════════════════════════════════════════
// GASTOS
// ═══════════════════════════════════════════════
async function renderGastos(){
  await cargarDatos('gastos','getGastos');await cargarDatos('proveedores','getProveedores');
  const sec=document.getElementById('sec-gastos');const gastos=state.gastos||[];const hoy=hoyStr();const now=new Date();
  const gHoy=gastos.filter(g=>String(g.Fecha).substring(0,10)===hoy).reduce((s,g)=>s+(parseFloat(g.Monto)||0),0);
  const gMes=gastos.filter(g=>{const d=new Date(g.Fecha);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).reduce((s,g)=>s+(parseFloat(g.Monto)||0),0);
  const catM={};gastos.filter(g=>{const d=new Date(g.Fecha);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).forEach(g=>{catM[g.Categoria||'Otro']=(catM[g.Categoria||'Otro']||0)+(parseFloat(g.Monto)||0);});const topCat=Object.entries(catM).sort((a,b)=>b[1]-a[1])[0];
  sec.innerHTML=`<div class="cards"><div class="card"><div class="card-icon red"><i data-lucide="calendar-check"></i></div><div class="card-label">Gastos Hoy</div><div class="card-value text-red">${formatearMoneda(gHoy)}</div></div><div class="card"><div class="card-icon red"><i data-lucide="calendar-range"></i></div><div class="card-label">Gastos Mes</div><div class="card-value text-red">${formatearMoneda(gMes)}</div></div><div class="card"><div class="card-icon yellow"><i data-lucide="tag"></i></div><div class="card-label">Categoría Top</div><div class="card-value text-yellow" style="font-size:1.1rem">${topCat?topCat[0]:'—'}</div><div class="card-sub">${topCat?formatearMoneda(topCat[1]):''}</div></div><div class="card"><div class="card-icon pink"><i data-lucide="list"></i></div><div class="card-label">Registros</div><div class="card-value">${gastos.length}</div></div></div>
    <div class="charts-grid"><div class="chart-box"><h3>Por Categoría</h3><canvas id="chartGastosCat"></canvas></div><div class="chart-box" style="display:flex;align-items:center;justify-content:center"><button class="btn btn-primary btn-lg" onclick="abrirModalGasto()"><i data-lucide="plus-circle" style="width:20px;height:20px"></i> Registrar Gasto</button></div></div>
    <div class="table-wrap"><div class="table-header"><h3><i data-lucide="wallet" style="width:20px;height:20px;color:var(--pink)"></i> Gastos</h3><div class="table-actions"><select id="gastosCatFiltro" onchange="filtrarGastos()"><option value="">Todas</option><option>Inventario</option><option>Operación</option><option>Servicios</option><option>Empleados</option><option>Alquiler</option><option>Otro</option></select><button class="btn btn-primary btn-sm" onclick="abrirModalGasto()"><i data-lucide="plus" style="width:16px;height:16px"></i> Nuevo</button></div></div><div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th>Proveedor</th></tr></thead><tbody id="gastosBody"></tbody></table></div></div>`;
  const palette=['#e87ea3','#5cb85c','#f0a500','#5dade2','#8b5e3c','#f4a7c1','#c49a6c'];
  if(charts.gastosCat)charts.gastosCat.destroy();const ctx=document.getElementById('chartGastosCat');if(ctx&&Object.keys(catM).length)charts.gastosCat=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(catM),datasets:[{data:Object.values(catM),backgroundColor:palette,borderWidth:0}]},options:{responsive:true,cutout:'72%',plugins:{legend:{position:'bottom',labels:{color:'#8b6f66',padding:14,usePointStyle:true}}}}});
  filtrarGastos();refreshIcons();
}
function filtrarGastos(){const cat=document.getElementById('gastosCatFiltro')?.value||'';let g=state.gastos||[];if(cat)g=g.filter(x=>x.Categoria===cat);g.sort((a,b)=>b.Fecha>a.Fecha?1:-1);const tb=document.getElementById('gastosBody');if(!tb)return;tb.innerHTML=g.map(x=>`<tr><td>${formatearFecha(x.Fecha)}</td><td><span class="badge badge-pink">${x.Categoria}</span></td><td>${x.Descripcion}</td><td><strong style="color:var(--red)">${formatearMoneda(x.Monto)}</strong></td><td style="color:var(--text-muted)">${x.ProveedorNombre||'—'}</td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state"><p>No hay gastos</p></div></td></tr>';}
function abrirModalGasto(){const pOpts=(state.proveedores||[]).map(p=>`<option value="${p.ID}" data-nombre="${p.Nombre}">${p.Nombre}</option>`).join('');mostrarModal(`<h2><i data-lucide="wallet" style="width:20px;height:20px;color:var(--pink)"></i> Registrar Gasto</h2><div class="form-row"><div class="form-group"><label>Fecha</label><input type="date" id="gastoFecha" value="${hoyStr()}"></div><div class="form-group"><label>Categoría</label><select id="gastoCat"><option>Inventario</option><option>Operación</option><option>Servicios</option><option>Empleados</option><option>Alquiler</option><option>Otro</option></select></div></div><div class="form-group"><label>Descripción</label><input id="gastoDesc"></div><div class="form-row"><div class="form-group"><label>Monto</label><input type="number" id="gastoMonto" step="0.01"></div><div class="form-group"><label>Proveedor</label><select id="gastoProv"><option value="">Sin proveedor</option>${pOpts}</select></div></div><div class="form-group"><label>Notas</label><textarea id="gastoNotas" rows="2"></textarea></div><button class="btn btn-primary btn-block" onclick="guardarGasto()">Guardar</button>`);}
async function guardarGasto(){const pSel=document.getElementById('gastoProv');try{mostrarBusy('Guardando gasto...');await apiPost('registrarGasto',{fecha:document.getElementById('gastoFecha').value,categoria:document.getElementById('gastoCat').value,descripcion:document.getElementById('gastoDesc').value,monto:document.getElementById('gastoMonto').value,proveedorId:pSel.value,proveedorNombre:pSel.value?pSel.options[pSel.selectedIndex].dataset.nombre:'',notas:document.getElementById('gastoNotas').value});invalidarCache('gastos','dashboard');state.gastos=null;cerrarModal();mostrarToast('Gasto registrado');renderGastos();}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}

// ═══════════════════════════════════════════════
// REPORTES
// ═══════════════════════════════════════════════
async function renderReportes(){
  await cargarDatos('ventas','getVentas');await cargarDatos('gastos','getGastos');await cargarDatos('productos','getProductos');await cargarDatos('clientes','getClientes');await cargarDatos('deudas','getDeudas');
  const sec=document.getElementById('sec-reportes');
  sec.innerHTML=`<div class="filter-bar"><strong>Período:</strong><button class="btn btn-sm tab" onclick="setReportePeriodo('hoy',this)">Hoy</button><button class="btn btn-sm tab" onclick="setReportePeriodo('semana',this)">Semana</button><button class="btn btn-sm tab active" onclick="setReportePeriodo('mes',this)">Mes</button><button class="btn btn-sm tab" onclick="setReportePeriodo('anio',this)">Año</button><input type="date" id="repFechaInicio" onchange="setReportePeriodo('custom')"><input type="date" id="repFechaFin" onchange="setReportePeriodo('custom')"></div><div class="tabs"><div class="tab active" onclick="showReporteTab('ventas',this)">Ventas</div><div class="tab" onclick="showReporteTab('productos',this)">Productos</div><div class="tab" onclick="showReporteTab('financiero',this)">Financiero</div><div class="tab" onclick="showReporteTab('clientesRep',this)">Clientes</div></div><div id="reporteContent"></div>`;
  window._reportePeriodo={inicio:hoyStr(),fin:hoyStr()};setReportePeriodo('mes');refreshIcons();
}
function setReportePeriodo(tipo,btn){
  const h=new Date();let ini,fin=hoyStr();
  switch(tipo){case 'hoy':ini=hoyStr();break;case 'semana':const dow=h.getDay();const l=new Date(h);l.setDate(h.getDate()-((dow+6)%7));ini=l.toISOString().split('T')[0];break;case 'mes':ini=h.getFullYear()+'-'+String(h.getMonth()+1).padStart(2,'0')+'-01';break;case 'anio':ini=h.getFullYear()+'-01-01';break;case 'custom':ini=document.getElementById('repFechaInicio')?.value||hoyStr();fin=document.getElementById('repFechaFin')?.value||hoyStr();break;}
  window._reportePeriodo={inicio:ini,fin};if(btn){document.querySelectorAll('.filter-bar .tab').forEach(t=>t.classList.remove('active'));btn.classList.add('active');}
  const at=document.querySelector('.tabs .tab.active'),tn=at?at.textContent.trim().toLowerCase():'ventas';showReporteTab({ventas:'ventas',productos:'productos',financiero:'financiero',clientes:'clientesRep'}[tn]||'ventas');
}
function showReporteTab(tab,btn){
  if(btn){document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));btn.classList.add('active');}
  const{inicio,fin}=window._reportePeriodo;const ventas=(state.ventas||[]).filter(v=>v.Fecha>=inicio&&v.Fecha<=fin);const gastos=(state.gastos||[]).filter(g=>g.Fecha>=inicio&&g.Fecha<=fin);const div=document.getElementById('reporteContent');
  switch(tab){case 'ventas':renderRepVentas(div,ventas);break;case 'productos':renderRepProductos(div,ventas);break;case 'financiero':renderRepFinanciero(div,ventas,gastos);break;case 'clientesRep':renderRepClientes(div,ventas);break;}
}
function renderRepVentas(div,ventas){
  const tv=ventas.reduce((s,v)=>s+(parseFloat(v.Total)||0),0);const tp=ventas.length?tv/ventas.length:0;const pd={};ventas.forEach(v=>{pd[v.Fecha]=(pd[v.Fecha]||0)+(parseFloat(v.Total)||0);});
  div.innerHTML=`<div class="cards"><div class="card"><div class="card-icon green"><i data-lucide="banknote"></i></div><div class="card-label">Total</div><div class="card-value text-green">${formatearMoneda(tv)}</div></div><div class="card"><div class="card-icon blue"><i data-lucide="hash"></i></div><div class="card-label">Transacciones</div><div class="card-value text-blue">${ventas.length}</div></div><div class="card"><div class="card-icon pink"><i data-lucide="receipt"></i></div><div class="card-label">Ticket Promedio</div><div class="card-value text-pink">${formatearMoneda(tp)}</div></div></div><div class="charts-grid"><div class="chart-box"><h3>Evolución</h3><canvas id="rcV"></canvas></div><div class="chart-box"><h3>Por Día</h3><canvas id="rcDS"></canvas></div></div><div class="table-wrap"><div class="table-header"><h3>Detalle</h3><button class="btn btn-outline btn-sm no-print" onclick="window.print()"><i data-lucide="printer" style="width:14px;height:14px"></i></button></div><div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Método</th><th>Estado</th></tr></thead><tbody>${ventas.map(v=>`<tr><td>${formatearFecha(v.Fecha)}</td><td>${v.ClienteNombre}</td><td>${formatearMoneda(v.Total)}</td><td>${v.MetodoPago}</td><td>${badgeEstado(v.Estado)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-state">Sin datos</td></tr>'}</tbody></table></div></div>`;refreshIcons();
  if(charts.rcV)charts.rcV.destroy();const c=document.getElementById('rcV');if(c&&Object.keys(pd).length){const f=Object.keys(pd).sort();charts.rcV=new Chart(c,{type:'line',data:{labels:f.map(x=>{const p=x.split('-');return p[2]+'/'+p[1];}),datasets:[{label:'Ventas',data:f.map(x=>pd[x]),borderColor:'#e87ea3',backgroundColor:'rgba(232,126,163,.08)',fill:true,tension:.4,pointRadius:0,borderWidth:2.5}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#b8a098'}},y:{grid:{color:'rgba(240,221,214,.5)'},ticks:{color:'#b8a098'}}}}});}
  if(charts.rcDS)charts.rcDS.destroy();const c2=document.getElementById('rcDS');if(c2){const ds=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],pds=[0,0,0,0,0,0,0];ventas.forEach(v=>{const d=new Date(v.Fecha+'T12:00:00');pds[d.getDay()]+=(parseFloat(v.Total)||0);});charts.rcDS=new Chart(c2,{type:'bar',data:{labels:ds,datasets:[{data:pds,backgroundColor:'#5cb85c',borderRadius:8}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#b8a098'}},y:{grid:{color:'rgba(240,221,214,.5)'},ticks:{color:'#b8a098'}}}}});}
}
async function renderRepProductos(div,ventas){const det=[];for(const v of ventas){try{const d=await apiGet('getDetalleVenta',{ventaId:v.ID});det.push(...d);}catch(e){}}const pm={};det.forEach(d=>{if(!pm[d.ProductoID])pm[d.ProductoID]={nombre:d.ProductoNombre,cantidad:0,monto:0};pm[d.ProductoID].cantidad+=parseInt(d.Cantidad)||0;pm[d.ProductoID].monto+=parseFloat(d.Subtotal)||0;});const top=Object.values(pm).sort((a,b)=>b.cantidad-a.cantidad).slice(0,10);const ids=new Set(Object.keys(pm));const sinMov=(state.productos||[]).filter(p=>!ids.has(p.ID));
  div.innerHTML=`<div class="charts-grid"><div class="chart-box"><h3>Top Productos</h3><canvas id="rcTP"></canvas></div><div class="chart-box"><h3>Márgenes</h3><div style="overflow-x:auto;max-height:400px;overflow-y:auto"><table><thead><tr><th>Producto</th><th>Precio</th><th>Costo</th><th>Margen</th></tr></thead><tbody>${(state.productos||[]).map(p=>{const m=parseFloat(p.Costo)>0?Math.round((parseFloat(p.Precio)-parseFloat(p.Costo))/parseFloat(p.Costo)*100):0;return`<tr><td>${p.Nombre}</td><td>${formatearMoneda(p.Precio)}</td><td>${formatearMoneda(p.Costo)}</td><td><span class="badge ${m>30?'badge-green':m>15?'badge-yellow':'badge-red'}">${m}%</span></td></tr>`;}).join('')}</tbody></table></div></div></div>${sinMov.length?`<div class="table-wrap" style="margin-top:16px"><div class="table-header"><h3>Sin Movimiento</h3></div><div style="overflow-x:auto"><table><thead><tr><th>Nombre</th><th>Categoría</th><th>Stock</th></tr></thead><tbody>${sinMov.map(p=>`<tr><td>${p.Nombre}</td><td>${p['Categoría']||''}</td><td>${p.Stock}</td></tr>`).join('')}</tbody></table></div></div>`:''}`;refreshIcons();
  if(charts.rcTP)charts.rcTP.destroy();const c=document.getElementById('rcTP');if(c&&top.length)charts.rcTP=new Chart(c,{type:'bar',data:{labels:top.map(p=>p.nombre),datasets:[{data:top.map(p=>p.cantidad),backgroundColor:'#e87ea3',borderRadius:6}]},options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(240,221,214,.5)'},ticks:{color:'#b8a098'}},y:{grid:{display:false},ticks:{color:'#8b6f66'}}}}});
}
function renderRepFinanciero(div,ventas,gastos){
  const ti=ventas.reduce((s,v)=>s+(parseFloat(v.Total)||0),0);const tg=gastos.reduce((s,g)=>s+(parseFloat(g.Monto)||0),0);const u=ti-tg;const cg={};gastos.forEach(g=>{cg[g.Categoria||'Otro']=(cg[g.Categoria||'Otro']||0)+(parseFloat(g.Monto)||0);});const dc=(state.deudas||[]).filter(d=>d.Tipo==='cliente'&&d.Estado==='Pendiente').reduce((s,d)=>s+(parseFloat(d.SaldoPendiente)||0),0);
  div.innerHTML=`<div class="cards"><div class="card"><div class="card-icon green"><i data-lucide="trending-up"></i></div><div class="card-label">Ingresos</div><div class="card-value text-green">${formatearMoneda(ti)}</div></div><div class="card"><div class="card-icon red"><i data-lucide="trending-down"></i></div><div class="card-label">Gastos</div><div class="card-value text-red">${formatearMoneda(tg)}</div></div><div class="card"><div class="card-icon ${u>=0?'green':'red'}"><i data-lucide="target"></i></div><div class="card-label">Utilidad</div><div class="card-value ${u>=0?'text-green':'text-red'}">${formatearMoneda(u)}</div></div><div class="card"><div class="card-icon yellow"><i data-lucide="clock"></i></div><div class="card-label">Por Cobrar</div><div class="card-value text-yellow">${formatearMoneda(dc)}</div></div></div><div class="charts-grid"><div class="chart-box"><h3>Ingresos vs Gastos</h3><canvas id="rcIG"></canvas></div><div class="chart-box"><h3>Gastos por Categoría</h3><canvas id="rcGD"></canvas></div></div><button class="btn btn-outline no-print" onclick="window.print()"><i data-lucide="printer" style="width:16px;height:16px"></i> Exportar</button>`;refreshIcons();
  const palette=['#e87ea3','#5cb85c','#f0a500','#5dade2','#8b5e3c','#f4a7c1'];
  if(charts.rcIG)charts.rcIG.destroy();const c=document.getElementById('rcIG');if(c)charts.rcIG=new Chart(c,{type:'bar',data:{labels:['Ingresos','Gastos','Utilidad'],datasets:[{data:[ti,tg,u],backgroundColor:['#5cb85c','#e74c3c',u>=0?'#e87ea3':'#f0a500'],borderRadius:10}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#b8a098'}},y:{grid:{color:'rgba(240,221,214,.5)'},ticks:{color:'#b8a098'}}}}});
  if(charts.rcGD)charts.rcGD.destroy();const c2=document.getElementById('rcGD');if(c2&&Object.keys(cg).length)charts.rcGD=new Chart(c2,{type:'doughnut',data:{labels:Object.keys(cg),datasets:[{data:Object.values(cg),backgroundColor:palette,borderWidth:0}]},options:{responsive:true,cutout:'72%',plugins:{legend:{position:'bottom',labels:{color:'#8b6f66',padding:14,usePointStyle:true}}}}});
}
function renderRepClientes(div,ventas){
  const cm={};ventas.forEach(v=>{if(!v.ClienteID)return;if(!cm[v.ClienteID])cm[v.ClienteID]={nombre:v.ClienteNombre,total:0,count:0};cm[v.ClienteID].total+=parseFloat(v.Total)||0;cm[v.ClienteID].count++;});const top=Object.values(cm).sort((a,b)=>b.total-a.total).slice(0,10);const da=(state.deudas||[]).filter(d=>d.Tipo==='cliente'&&d.Estado==='Pendiente');
  div.innerHTML=`<div class="charts-grid"><div class="chart-box"><h3>Top Clientes</h3><canvas id="rcTC"></canvas></div><div class="chart-box"><h3>Resumen</h3><div class="cards" style="grid-template-columns:1fr"><div class="card"><div class="card-label">Con Compras</div><div class="card-value">${Object.keys(cm).length}</div></div><div class="card"><div class="card-label">Total</div><div class="card-value">${(state.clientes||[]).length}</div></div></div></div></div>${da.length?`<div class="table-wrap" style="margin-top:16px"><div class="table-header"><h3>Deudas Activas</h3></div><div style="overflow-x:auto"><table><thead><tr><th>Cliente</th><th>Original</th><th>Pagado</th><th>Pendiente</th></tr></thead><tbody>${da.map(d=>`<tr><td>${d.EntidadNombre}</td><td>${formatearMoneda(d.MontoOriginal)}</td><td>${formatearMoneda(d.MontoPagado)}</td><td style="color:var(--red);font-weight:700">${formatearMoneda(d.SaldoPendiente)}</td></tr>`).join('')}</tbody></table></div></div>`:''}`;refreshIcons();
  if(charts.rcTC)charts.rcTC.destroy();const c=document.getElementById('rcTC');if(c&&top.length)charts.rcTC=new Chart(c,{type:'bar',data:{labels:top.map(x=>x.nombre),datasets:[{data:top.map(x=>x.total),backgroundColor:'#8b5e3c',borderRadius:6}]},options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(240,221,214,.5)'},ticks:{color:'#b8a098'}},y:{grid:{display:false},ticks:{color:'#8b6f66'}}}}});
}

// ═══════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════
async function renderConfig(){
  await cargarDatos('config','getConfig');const cfg=state.config||{};
  const sec=document.getElementById('sec-config');
  sec.innerHTML=`
    <div class="chart-box" style="max-width:720px"><h3><i data-lucide="building-2" style="width:18px;height:18px;color:var(--pink)"></i> Datos del Negocio</h3><div class="form-group" style="margin-top:16px"><label>Nombre</label><input id="cfgNombre" value="${cfg.NombreNegocio||''}"></div><div class="form-row"><div class="form-group"><label>RNC</label><input id="cfgRNC" value="${cfg.RNC||''}"></div><div class="form-group"><label>Teléfono</label><input id="cfgTel" value="${cfg.Telefono||''}"></div></div><div class="form-row"><div class="form-group"><label>Email</label><input id="cfgEmail" value="${cfg.Email||''}"></div><div class="form-group"><label>Dirección</label><input id="cfgDir" value="${cfg.Direccion||''}"></div></div><div class="form-group"><label>URL Logo</label><input id="cfgLogo" value="${cfg.Logo||''}"></div></div>
    <div class="chart-box" style="max-width:720px;margin-top:16px"><h3><i data-lucide="file-text" style="width:18px;height:18px;color:var(--pink)"></i> Facturas</h3><div class="form-row" style="margin-top:16px"><div class="form-group"><label>Prefijo</label><input id="cfgPrefix" value="${cfg.PrefixFactura||'FAC'}"></div><div class="form-group"><label>Próximo N°</label><input type="number" id="cfgUltNum" value="${parseInt(cfg.UltimoNumeroFactura||0)+1}"></div></div></div>
    <div class="chart-box" style="max-width:720px;margin-top:16px"><h3><i data-lucide="calculator" style="width:18px;height:18px;color:var(--pink)"></i> Fiscal</h3><div class="form-row" style="margin-top:16px"><div class="form-group"><label>ITBIS %</label><input type="number" id="cfgITBIS" value="${cfg.ITBIS_Porcentaje||18}"></div><div class="form-group"><label>Moneda</label><input id="cfgMoneda" value="${cfg.MonedaSimbolo||'RD$'}"></div></div></div>
    <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap"><button class="btn btn-primary btn-lg" onclick="guardarConfiguracion()"><i data-lucide="save" style="width:18px;height:18px"></i> Guardar</button><button class="btn btn-warm btn-lg" onclick="inicializarDB()"><i data-lucide="database" style="width:18px;height:18px"></i> Inicializar BD</button></div>`;
  refreshIcons();
}
async function guardarConfiguracion(){try{mostrarBusy('Guardando configuración...');await apiPost('guardarConfig',{configs:{NombreNegocio:document.getElementById('cfgNombre').value,RNC:document.getElementById('cfgRNC').value,Telefono:document.getElementById('cfgTel').value,Email:document.getElementById('cfgEmail').value,Direccion:document.getElementById('cfgDir').value,Logo:document.getElementById('cfgLogo').value,PrefixFactura:document.getElementById('cfgPrefix').value,UltimoNumeroFactura:parseInt(document.getElementById('cfgUltNum').value)-1,ITBIS_Porcentaje:document.getElementById('cfgITBIS').value,MonedaSimbolo:document.getElementById('cfgMoneda').value}});invalidarCache('config');await cargarDatos('config','getConfig',true);const n=state.config.NombreNegocio||'Mi Negocio';document.getElementById('sidebarTitle').textContent=n;const tb=document.getElementById('topbarTitle');if(tb)tb.textContent=n;mostrarToast('Guardado');}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}
async function inicializarDB(){if(!confirm('¿Crear/verificar hojas?'))return;try{mostrarBusy('Inicializando base de datos...');const r=await apiGet('initDB');mostrarToast(r.hojasCreadas?.length?'Creadas: '+r.hojasCreadas.join(', '):'Ya existían');}catch(e){mostrarToast(e.message,'error');}finally{ocultarBusy();}}

// ═══ INIT ═══
async function init(){
  refreshIcons();
  try{
    mostrarLoader();
    // FASE 1 (bloqueante): config + dashboard — lo mínimo para mostrar el sitio
    await Promise.all([
      cargarDatos('config','getConfig'),
      cargarDatos('dashboard','getDashboard')
    ]);
    if(state.config?.NombreNegocio){
      const n=state.config.NombreNegocio;
      document.getElementById('sidebarTitle').textContent=n;
      const tb=document.getElementById('topbarTitle'); if(tb) tb.textContent=n;
      document.title=n+' — Gestión';
    }
    await renderDashboard();
    ocultarLoader();
    // FASE 2 (no bloqueante, en paralelo): precarga TODO el resto
    // para que cambiar de sección sea instantáneo.
    precargarTodo();
  }catch(e){
    document.getElementById('sec-dashboard').innerHTML=`<div class="alert-box warning"><h4><i data-lucide="wifi-off" style="width:18px;height:18px;vertical-align:middle"></i> No se pudo conectar</h4><p style="margin-top:8px;color:var(--text-secondary)">Configura <code style="background:var(--bg-surface-2);padding:2px 8px;border-radius:4px">API_URL</code> en app.js con tu URL de Web App.</p><p style="margin-top:6px;color:var(--text-muted)">Ve a <strong style="color:var(--pink);cursor:pointer" onclick="navegarA('config')">Configuración</strong> para inicializar la base de datos.</p></div>`;
    refreshIcons();
    ocultarLoader();
  }
}

// Precarga TODAS las secciones en paralelo tras mostrar el dashboard.
// Usa la barra de progreso sutil arriba. No bloquea la UI.
async function precargarTodo(){
  const tareas = [
    ['productos','getProductos'],
    ['clientes','getClientes'],
    ['proveedores','getProveedores'],
    ['ventas','getVentas'],
    ['gastos','getGastos'],
    ['facturas','getFacturas'],
    ['deudas','getDeudas']
  ];
  // Lanza todas a la vez — Google Apps Script responderá en paralelo
  await Promise.allSettled(tareas.map(([k,a])=>cargarDatos(k,a)));
}
