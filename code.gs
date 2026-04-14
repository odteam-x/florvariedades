// ═══════════════════════════════════════════════
// SISTEMA DE GESTIÓN DE NEGOCIOS — BACKEND
// Google Apps Script (code.gs)
// ═══════════════════════════════════════════════

// ──── UTILIDADES ────

function generarID() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function generarNumeroFactura() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ConfigNegocio');
  var data = sheet.getDataRange().getValues();
  var prefix = 'FAC';
  var ultimo = 0;
  var prefixRow = -1;
  var ultimoRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'PrefixFactura' && data[i][1]) prefix = data[i][1];
    if (data[i][0] === 'PrefixFactura') prefixRow = i + 1;
    if (data[i][0] === 'UltimoNumeroFactura') {
      ultimo = parseInt(data[i][1]) || 0;
      ultimoRow = i + 1;
    }
  }
  ultimo++;
  if (ultimoRow > 0) {
    sheet.getRange(ultimoRow, 2).setValue(ultimo);
  }
  var num = ('0000' + ultimo).slice(-4);
  return prefix + '-' + num;
}

function respuesta(success, data, error) {
  var obj = success ? { success: true, data: data } : { success: false, error: error || 'Error desconocido' };
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ──── HELPERS DE HOJAS ────

function getSheet(nombre) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
}

function getSheetData(nombre) {
  var sheet = getSheet(nombre);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

function findRowIndex(nombre, colName, value) {
  var sheet = getSheet(nombre);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) return -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(value)) return i + 1; // 1-based row
  }
  return -1;
}

function appendRow(nombre, obj) {
  var sheet = getSheet(nombre);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(obj[headers[i]] !== undefined ? obj[headers[i]] : '');
  }
  sheet.appendRow(row);
}

function updateRow(nombre, rowIndex, obj) {
  var sheet = getSheet(nombre);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var j = 0; j < headers.length; j++) {
    if (obj[headers[j]] !== undefined) {
      sheet.getRange(rowIndex, j + 1).setValue(obj[headers[j]]);
    }
  }
}

// ──── INICIALIZACIÓN DE BASE DE DATOS ────

function initDB() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var creadas = [];

  var hojas = {
    'Productos': ['ID', 'Nombre', 'Categoría', 'Precio', 'Costo', 'Stock', 'StockMinimo', 'Descripcion', 'ImagenURL', 'Activo', 'FechaCreacion'],
    'Clientes': ['ID', 'Nombre', 'Telefono', 'Email', 'Direccion', 'RNC', 'FechaCreacion', 'Notas'],
    'Proveedores': ['ID', 'Nombre', 'Telefono', 'Email', 'Direccion', 'RNC', 'FechaCreacion', 'Notas'],
    'Ventas': ['ID', 'Fecha', 'ClienteID', 'ClienteNombre', 'Subtotal', 'Descuento', 'ITBIS', 'Total', 'MetodoPago', 'Estado', 'Notas'],
    'DetalleVentas': ['ID', 'VentaID', 'ProductoID', 'ProductoNombre', 'Cantidad', 'PrecioUnitario', 'Subtotal'],
    'Gastos': ['ID', 'Fecha', 'Categoria', 'Descripcion', 'Monto', 'ProveedorID', 'ProveedorNombre', 'Notas'],
    'Facturas': ['ID', 'NumeroFactura', 'Fecha', 'FechaVencimiento', 'ClienteID', 'ClienteNombre', 'ClienteTelefono', 'ClienteEmail', 'Subtotal', 'Descuento', 'ITBIS', 'Total', 'Estado', 'Notas', 'VentaID'],
    'DetalleFacturas': ['ID', 'FacturaID', 'ProductoID', 'Descripcion', 'Cantidad', 'PrecioUnitario', 'Subtotal'],
    'Deudas': ['ID', 'Tipo', 'EntidadID', 'EntidadNombre', 'MontoOriginal', 'MontoPagado', 'SaldoPendiente', 'FechaCreacion', 'FechaVencimiento', 'Estado', 'Notas'],
    'ConfigNegocio': ['Clave', 'Valor']
  };

  for (var nombre in hojas) {
    var sheet = ss.getSheetByName(nombre);
    if (!sheet) {
      sheet = ss.insertSheet(nombre);
      sheet.getRange(1, 1, 1, hojas[nombre].length).setValues([hojas[nombre]]);
      creadas.push(nombre);
    }
  }

  // Insertar config por defecto si la hoja fue creada
  if (creadas.indexOf('ConfigNegocio') !== -1) {
    var configSheet = ss.getSheetByName('ConfigNegocio');
    var configs = [
      ['NombreNegocio', 'Mi Negocio'],
      ['RNC', ''],
      ['Telefono', ''],
      ['Email', ''],
      ['Direccion', ''],
      ['Logo', ''],
      ['MonedaSimbolo', 'RD$'],
      ['ITBIS_Porcentaje', '18'],
      ['PrefixFactura', 'FAC'],
      ['UltimoNumeroFactura', '0']
    ];
    for (var i = 0; i < configs.length; i++) {
      configSheet.appendRow(configs[i]);
    }
  }

  // ── Sin datos de ejemplo: la base arranca vacía ──

  return creadas;
}

// ──── ENDPOINTS ────

function doGet(e) {
  try {
    var action = e.parameter.action;
    switch (action) {
      case 'getProductos':
        var prods = getSheetData('Productos').filter(function(p) { return p.Activo === true || p.Activo === 'true' || p.Activo === 'TRUE'; });
        return respuesta(true, prods);

      case 'getClientes':
        return respuesta(true, getSheetData('Clientes'));

      case 'getProveedores':
        return respuesta(true, getSheetData('Proveedores'));

      case 'getVentas':
        var ventas = getSheetData('Ventas');
        var fi = e.parameter.fechaInicio;
        var ff = e.parameter.fechaFin;
        if (fi) ventas = ventas.filter(function(v) { return v.Fecha >= fi; });
        if (ff) ventas = ventas.filter(function(v) { return v.Fecha <= ff; });
        return respuesta(true, ventas);

      case 'getDetalleVenta':
        var ventaId = e.parameter.ventaId;
        var detalles = getSheetData('DetalleVentas').filter(function(d) { return String(d.VentaID) === String(ventaId); });
        return respuesta(true, detalles);

      case 'getGastos':
        var gastos = getSheetData('Gastos');
        var gi = e.parameter.fechaInicio;
        var gf = e.parameter.fechaFin;
        if (gi) gastos = gastos.filter(function(g) { return g.Fecha >= gi; });
        if (gf) gastos = gastos.filter(function(g) { return g.Fecha <= gf; });
        return respuesta(true, gastos);

      case 'getFacturas':
        return respuesta(true, getSheetData('Facturas'));

      case 'getDetalleFactura':
        var facturaId = e.parameter.facturaId;
        var detFac = getSheetData('DetalleFacturas').filter(function(d) { return String(d.FacturaID) === String(facturaId); });
        return respuesta(true, detFac);

      case 'getDeudas':
        return respuesta(true, getSheetData('Deudas'));

      case 'getConfig':
        var configData = getSheetData('ConfigNegocio');
        var config = {};
        configData.forEach(function(c) { config[c.Clave] = c.Valor; });
        return respuesta(true, config);

      case 'getDashboard':
        return respuesta(true, calcularDashboard());

      case 'initDB':
        var creadas = initDB();
        return respuesta(true, { hojasCreadas: creadas });

      default:
        return respuesta(false, null, 'Acción no reconocida: ' + action);
    }
  } catch (err) {
    return respuesta(false, null, err.toString());
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    switch (action) {
      case 'guardarProducto':
        return guardarProducto(body);
      case 'eliminarProducto':
        return eliminarProducto(body);
      case 'guardarCliente':
        return guardarCliente(body);
      case 'guardarProveedor':
        return guardarProveedor(body);
      case 'registrarVenta':
        return registrarVenta(body);
      case 'registrarGasto':
        return registrarGasto(body);
      case 'crearFactura':
        return crearFactura(body);
      case 'actualizarEstadoFactura':
        return actualizarEstadoFactura(body);
      case 'guardarConfig':
        return guardarConfigFn(body);
      case 'registrarPago':
        return registrarPago(body);
      case 'subirImagen':
        return subirImagenFn(body);
      default:
        return respuesta(false, null, 'Acción POST no reconocida: ' + action);
    }
  } catch (err) {
    return respuesta(false, null, err.toString());
  }
}

// ──── FUNCIONES POST ────

function guardarProducto(body) {
  var prod = body.producto || body;
  if (prod.id || prod.ID) {
    var id = prod.id || prod.ID;
    var row = findRowIndex('Productos', 'ID', id);
    if (row === -1) return respuesta(false, null, 'Producto no encontrado');
    updateRow('Productos', row, {
      Nombre: prod.nombre || prod.Nombre,
      'Categoría': prod.categoria || prod['Categoría'],
      Precio: parseFloat(prod.precio || prod.Precio),
      Costo: parseFloat(prod.costo || prod.Costo),
      Stock: parseInt(prod.stock || prod.Stock),
      StockMinimo: parseInt(prod.stockMinimo || prod.StockMinimo),
      Descripcion: prod.descripcion || prod.Descripcion || '',
      ImagenURL: prod.imagenURL || prod.ImagenURL || '',
      Activo: prod.activo !== undefined ? prod.activo : (prod.Activo !== undefined ? prod.Activo : true)
    });
    // Insertar imagen visible en el Sheet
    var imgUrl = prod.imagenURL || prod.ImagenURL || '';
    if (imgUrl) insertarImagenEnCelda(id, imgUrl);
    return respuesta(true, { id: id, actualizado: true });
  } else {
    var nuevo = {
      ID: generarID(),
      Nombre: prod.nombre || prod.Nombre,
      'Categoría': prod.categoria || prod['Categoría'] || '',
      Precio: parseFloat(prod.precio || prod.Precio || 0),
      Costo: parseFloat(prod.costo || prod.Costo || 0),
      Stock: parseInt(prod.stock || prod.Stock || 0),
      StockMinimo: parseInt(prod.stockMinimo || prod.StockMinimo || 0),
      Descripcion: prod.descripcion || prod.Descripcion || '',
      ImagenURL: prod.imagenURL || prod.ImagenURL || '',
      Activo: true,
      FechaCreacion: new Date().toISOString()
    };
    appendRow('Productos', nuevo);
    // Insertar imagen visible en el Sheet
    if (nuevo.ImagenURL) insertarImagenEnCelda(nuevo.ID, nuevo.ImagenURL);
    return respuesta(true, nuevo);
  }
}

function eliminarProducto(body) {
  var id = body.id || body.ID;
  var row = findRowIndex('Productos', 'ID', id);
  if (row === -1) return respuesta(false, null, 'Producto no encontrado');
  updateRow('Productos', row, { Activo: false });
  return respuesta(true, { id: id, eliminado: true });
}

function guardarCliente(body) {
  var cli = body.cliente || body;
  if (cli.id || cli.ID) {
    var id = cli.id || cli.ID;
    var row = findRowIndex('Clientes', 'ID', id);
    if (row === -1) return respuesta(false, null, 'Cliente no encontrado');
    updateRow('Clientes', row, {
      Nombre: cli.nombre || cli.Nombre,
      Telefono: cli.telefono || cli.Telefono || '',
      Email: cli.email || cli.Email || '',
      Direccion: cli.direccion || cli.Direccion || '',
      RNC: cli.rnc || cli.RNC || '',
      Notas: cli.notas || cli.Notas || ''
    });
    return respuesta(true, { id: id, actualizado: true });
  } else {
    var nuevo = {
      ID: generarID(),
      Nombre: cli.nombre || cli.Nombre,
      Telefono: cli.telefono || cli.Telefono || '',
      Email: cli.email || cli.Email || '',
      Direccion: cli.direccion || cli.Direccion || '',
      RNC: cli.rnc || cli.RNC || '',
      FechaCreacion: new Date().toISOString(),
      Notas: cli.notas || cli.Notas || ''
    };
    appendRow('Clientes', nuevo);
    return respuesta(true, nuevo);
  }
}

function guardarProveedor(body) {
  var prov = body.proveedor || body;
  if (prov.id || prov.ID) {
    var id = prov.id || prov.ID;
    var row = findRowIndex('Proveedores', 'ID', id);
    if (row === -1) return respuesta(false, null, 'Proveedor no encontrado');
    updateRow('Proveedores', row, {
      Nombre: prov.nombre || prov.Nombre,
      Telefono: prov.telefono || prov.Telefono || '',
      Email: prov.email || prov.Email || '',
      Direccion: prov.direccion || prov.Direccion || '',
      RNC: prov.rnc || prov.RNC || '',
      Notas: prov.notas || prov.Notas || ''
    });
    return respuesta(true, { id: id, actualizado: true });
  } else {
    var nuevo = {
      ID: generarID(),
      Nombre: prov.nombre || prov.Nombre,
      Telefono: prov.telefono || prov.Telefono || '',
      Email: prov.email || prov.Email || '',
      Direccion: prov.direccion || prov.Direccion || '',
      RNC: prov.rnc || prov.RNC || '',
      FechaCreacion: new Date().toISOString(),
      Notas: prov.notas || prov.Notas || ''
    };
    appendRow('Proveedores', nuevo);
    return respuesta(true, nuevo);
  }
}

function registrarVenta(body) {
  var ventaId = generarID();
  var items = body.items || [];
  var clienteId = body.clienteId || '';
  var clienteNombre = body.clienteNombre || 'Consumidor Final';
  var metodoPago = body.metodoPago || 'Efectivo';
  var descuento = parseFloat(body.descuento) || 0;
  var notas = body.notas || '';

  var subtotal = 0;
  items.forEach(function(item) {
    subtotal += (parseFloat(item.precio) || 0) * (parseInt(item.cantidad) || 0);
  });

  var configData = getSheetData('ConfigNegocio');
  var itbisPct = 18;
  configData.forEach(function(c) { if (c.Clave === 'ITBIS_Porcentaje') itbisPct = parseFloat(c.Valor) || 18; });

  var baseImponible = subtotal - descuento;
  var itbis = body.aplicarITBIS !== false ? Math.round(baseImponible * (itbisPct / 100) * 100) / 100 : 0;
  var total = baseImponible + itbis;
  var fecha = new Date().toISOString().split('T')[0];

  appendRow('Ventas', {
    ID: ventaId, Fecha: fecha, ClienteID: clienteId, ClienteNombre: clienteNombre,
    Subtotal: subtotal, Descuento: descuento, ITBIS: itbis, Total: total,
    MetodoPago: metodoPago, Estado: 'Completada', Notas: notas
  });

  items.forEach(function(item) {
    var subItem = (parseFloat(item.precio) || 0) * (parseInt(item.cantidad) || 0);
    appendRow('DetalleVentas', {
      ID: generarID(), VentaID: ventaId, ProductoID: item.productoId || '',
      ProductoNombre: item.nombre || '', Cantidad: parseInt(item.cantidad) || 0,
      PrecioUnitario: parseFloat(item.precio) || 0, Subtotal: subItem
    });

    // Decrementar stock
    if (item.productoId) {
      var prodRow = findRowIndex('Productos', 'ID', item.productoId);
      if (prodRow > 0) {
        var sheet = getSheet('Productos');
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var stockCol = headers.indexOf('Stock') + 1;
        var currentStock = sheet.getRange(prodRow, stockCol).getValue();
        sheet.getRange(prodRow, stockCol).setValue(currentStock - (parseInt(item.cantidad) || 0));
      }
    }
  });

  // Si es crédito, crear deuda
  if (metodoPago.toLowerCase() === 'crédito' || metodoPago.toLowerCase() === 'credito') {
    appendRow('Deudas', {
      ID: generarID(), Tipo: 'cliente', EntidadID: clienteId, EntidadNombre: clienteNombre,
      MontoOriginal: total, MontoPagado: 0, SaldoPendiente: total,
      FechaCreacion: fecha,
      FechaVencimiento: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      Estado: 'Pendiente', Notas: 'Venta a crédito #' + ventaId
    });
  }

  return respuesta(true, {
    id: ventaId, fecha: fecha, subtotal: subtotal, descuento: descuento,
    itbis: itbis, total: total, metodoPago: metodoPago, clienteNombre: clienteNombre, items: items
  });
}

function registrarGasto(body) {
  var gasto = {
    ID: generarID(),
    Fecha: body.fecha || new Date().toISOString().split('T')[0],
    Categoria: body.categoria || '',
    Descripcion: body.descripcion || '',
    Monto: parseFloat(body.monto) || 0,
    ProveedorID: body.proveedorId || '',
    ProveedorNombre: body.proveedorNombre || '',
    Notas: body.notas || ''
  };
  appendRow('Gastos', gasto);
  return respuesta(true, gasto);
}

function crearFactura(body) {
  var facId = generarID();
  var numFac = generarNumeroFactura();
  var items = body.items || [];
  var clienteId = body.clienteId || '';
  var clienteNombre = body.clienteNombre || '';
  var clienteTelefono = body.clienteTelefono || '';
  var clienteEmail = body.clienteEmail || '';
  var descuento = parseFloat(body.descuento) || 0;
  var notas = body.notas || '';
  var fecha = body.fecha || new Date().toISOString().split('T')[0];
  var fechaVenc = body.fechaVencimiento || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  var ventaId = body.ventaId || '';

  var subtotal = 0;
  items.forEach(function(item) {
    subtotal += (parseFloat(item.precio || item.precioUnitario) || 0) * (parseInt(item.cantidad) || 0);
  });

  var configData = getSheetData('ConfigNegocio');
  var itbisPct = 18;
  configData.forEach(function(c) { if (c.Clave === 'ITBIS_Porcentaje') itbisPct = parseFloat(c.Valor) || 18; });

  var baseImponible = subtotal - descuento;
  var itbis = body.aplicarITBIS !== false ? Math.round(baseImponible * (itbisPct / 100) * 100) / 100 : 0;
  var total = baseImponible + itbis;

  appendRow('Facturas', {
    ID: facId, NumeroFactura: numFac, Fecha: fecha, FechaVencimiento: fechaVenc,
    ClienteID: clienteId, ClienteNombre: clienteNombre, ClienteTelefono: clienteTelefono, ClienteEmail: clienteEmail,
    Subtotal: subtotal, Descuento: descuento, ITBIS: itbis, Total: total,
    Estado: 'Pendiente', Notas: notas, VentaID: ventaId
  });

  items.forEach(function(item) {
    var subItem = (parseFloat(item.precio || item.precioUnitario) || 0) * (parseInt(item.cantidad) || 0);
    appendRow('DetalleFacturas', {
      ID: generarID(), FacturaID: facId, ProductoID: item.productoId || '',
      Descripcion: item.descripcion || item.nombre || '', Cantidad: parseInt(item.cantidad) || 0,
      PrecioUnitario: parseFloat(item.precio || item.precioUnitario) || 0, Subtotal: subItem
    });
  });

  return respuesta(true, {
    id: facId, numeroFactura: numFac, fecha: fecha, fechaVencimiento: fechaVenc,
    clienteNombre: clienteNombre, clienteTelefono: clienteTelefono, clienteEmail: clienteEmail,
    subtotal: subtotal, descuento: descuento, itbis: itbis, total: total, items: items
  });
}

function actualizarEstadoFactura(body) {
  var id = body.id || body.ID;
  var estado = body.estado;
  var row = findRowIndex('Facturas', 'ID', id);
  if (row === -1) return respuesta(false, null, 'Factura no encontrada');
  updateRow('Facturas', row, { Estado: estado });
  return respuesta(true, { id: id, estado: estado });
}

function guardarConfigFn(body) {
  var configs = body.configs || body.config || {};
  var sheet = getSheet('ConfigNegocio');
  var data = sheet.getDataRange().getValues();
  for (var clave in configs) {
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === clave) {
        sheet.getRange(i + 1, 2).setValue(configs[clave]);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([clave, configs[clave]]);
    }
  }
  return respuesta(true, { guardado: true });
}

function registrarPago(body) {
  var id = body.id || body.ID;
  var monto = parseFloat(body.monto) || 0;
  var row = findRowIndex('Deudas', 'ID', id);
  if (row === -1) return respuesta(false, null, 'Deuda no encontrada');

  var sheet = getSheet('Deudas');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var pagadoCol = headers.indexOf('MontoPagado') + 1;
  var saldoCol = headers.indexOf('SaldoPendiente') + 1;
  var estadoCol = headers.indexOf('Estado') + 1;

  var pagado = parseFloat(sheet.getRange(row, pagadoCol).getValue()) || 0;
  var saldo = parseFloat(sheet.getRange(row, saldoCol).getValue()) || 0;

  pagado += monto;
  saldo = saldo - monto;
  if (saldo < 0) saldo = 0;

  sheet.getRange(row, pagadoCol).setValue(pagado);
  sheet.getRange(row, saldoCol).setValue(saldo);
  if (saldo === 0) {
    sheet.getRange(row, estadoCol).setValue('Pagada');
  }

  return respuesta(true, { id: id, montoPagado: pagado, saldoPendiente: saldo });
}

// ──── SUBIR IMAGEN ────
// Guarda la imagen base64 en Google Drive y retorna la URL pública
// También inserta la imagen en la celda del producto en la hoja

function subirImagenFn(body) {
  var base64Data = body.imagen || '';
  var nombre = body.nombre || 'imagen_' + Date.now();

  if (!base64Data) return respuesta(false, null, 'No se recibió imagen');

  try {
    // Extraer el contenido base64 puro y el tipo MIME
    var matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return respuesta(false, null, 'Formato de imagen inválido');

    var mimeType = matches[1];
    var data = matches[2];
    var blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, nombre);

    // Crear o encontrar la carpeta "ImagenesNegocio" en Drive
    var folders = DriveApp.getFoldersByName('ImagenesNegocio');
    var folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder('ImagenesNegocio');
    }

    // Guardar el archivo en Drive
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Generar URL directa de la imagen
    var fileId = file.getId();
    var url = 'https://drive.google.com/uc?export=view&id=' + fileId;

    return respuesta(true, { url: url, fileId: fileId, imageUrl: url });
  } catch (err) {
    return respuesta(false, null, 'Error subiendo imagen: ' + err.toString());
  }
}

// Función para insertar imagen en la celda del producto en el Sheet
function insertarImagenEnCelda(productoId, imageUrl) {
  if (!imageUrl || !productoId) return;
  try {
    var sheet = getSheet('Productos');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('ID');
    var imgCol = headers.indexOf('ImagenURL');
    if (idCol === -1 || imgCol === -1) return;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(productoId)) {
        // Guardar la URL en la celda
        sheet.getRange(i + 1, imgCol + 1).setValue(imageUrl);

        // Si es una URL de Google Drive, insertar como IMAGE() en la columna siguiente
        // para que sea visible directamente en el Sheet
        if (imageUrl.indexOf('drive.google.com') !== -1) {
          var formulaCol = imgCol + 2; // Columna siguiente a ImagenURL
          // Verificar que exista la columna, si no crear un encabezado
          if (headers.length <= imgCol + 1) {
            sheet.getRange(1, formulaCol).setValue('VistaPrevia');
          }
          sheet.getRange(i + 1, formulaCol).setFormula('=IMAGE("' + imageUrl + '",1)');
          sheet.setRowHeight(i + 1, 60);
        }
        break;
      }
    }
  } catch (e) {
    // No fallar silenciosamente, pero no es crítico
  }
}

// ──── CÁLCULO DASHBOARD ────

function calcularDashboard() {
  var hoy = new Date();
  var hoyStr = hoy.toISOString().split('T')[0];
  var mesActual = hoy.getMonth();
  var anioActual = hoy.getFullYear();

  var ventas = getSheetData('Ventas');
  var gastos = getSheetData('Gastos');
  var clientes = getSheetData('Clientes');
  var productos = getSheetData('Productos').filter(function(p) { return p.Activo === true || p.Activo === 'true' || p.Activo === 'TRUE'; });
  var detalleVentas = getSheetData('DetalleVentas');
  var facturas = getSheetData('Facturas');
  var deudas = getSheetData('Deudas');

  // Ventas hoy
  var ventasHoy = 0;
  ventas.forEach(function(v) {
    var fv = String(v.Fecha).substring(0, 10);
    if (fv === hoyStr) ventasHoy += parseFloat(v.Total) || 0;
  });

  // Ventas mes actual
  var ventasMes = 0;
  ventas.forEach(function(v) {
    var d = new Date(v.Fecha);
    if (d.getMonth() === mesActual && d.getFullYear() === anioActual) ventasMes += parseFloat(v.Total) || 0;
  });

  // Ventas mes anterior
  var mesAnt = mesActual === 0 ? 11 : mesActual - 1;
  var anioAnt = mesActual === 0 ? anioActual - 1 : anioActual;
  var ventasMesAnterior = 0;
  ventas.forEach(function(v) {
    var d = new Date(v.Fecha);
    if (d.getMonth() === mesAnt && d.getFullYear() === anioAnt) ventasMesAnterior += parseFloat(v.Total) || 0;
  });

  var crecimientoMes = ventasMesAnterior > 0 ? Math.round(((ventasMes - ventasMesAnterior) / ventasMesAnterior) * 10000) / 100 : 0;

  // Gastos mes
  var gastosMes = 0;
  gastos.forEach(function(g) {
    var d = new Date(g.Fecha);
    if (d.getMonth() === mesActual && d.getFullYear() === anioActual) gastosMes += parseFloat(g.Monto) || 0;
  });

  var utilidadMes = ventasMes - gastosMes;

  // Stock bajo
  var productosStockBajo = productos.filter(function(p) {
    return (parseInt(p.Stock) || 0) <= (parseInt(p.StockMinimo) || 0);
  });

  // Top productos
  var prodVentas = {};
  detalleVentas.forEach(function(d) {
    var pid = d.ProductoID;
    if (!prodVentas[pid]) prodVentas[pid] = { id: pid, nombre: d.ProductoNombre, cantidad: 0, monto: 0 };
    prodVentas[pid].cantidad += parseInt(d.Cantidad) || 0;
    prodVentas[pid].monto += parseFloat(d.Subtotal) || 0;
  });
  var topProductos = Object.keys(prodVentas).map(function(k) { return prodVentas[k]; })
    .sort(function(a, b) { return b.cantidad - a.cantidad; }).slice(0, 5);

  // Ventas últimos 30 días
  var ventasPorDia = [];
  for (var i = 29; i >= 0; i--) {
    var dia = new Date(hoy);
    dia.setDate(dia.getDate() - i);
    var diaStr = dia.toISOString().split('T')[0];
    var totalDia = 0;
    ventas.forEach(function(v) {
      if (String(v.Fecha).substring(0, 10) === diaStr) totalDia += parseFloat(v.Total) || 0;
    });
    ventasPorDia.push({ fecha: diaStr, total: totalDia });
  }

  // Ventas por categoría
  var ventasPorCategoria = {};
  detalleVentas.forEach(function(d) {
    var prod = productos.find(function(p) { return p.ID === d.ProductoID; });
    var cat = prod ? prod['Categoría'] : 'Sin categoría';
    ventasPorCategoria[cat] = (ventasPorCategoria[cat] || 0) + (parseFloat(d.Subtotal) || 0);
  });

  // Facturas pendientes
  var facturasPendientes = facturas.filter(function(f) { return f.Estado === 'Pendiente'; }).length;

  // Deudas clientes
  var totalDeudaClientes = 0;
  deudas.forEach(function(d) {
    if (d.Tipo === 'cliente' && d.Estado === 'Pendiente') totalDeudaClientes += parseFloat(d.SaldoPendiente) || 0;
  });

  // Método de pago distribución
  var metodoPagoDistribucion = { Efectivo: 0, Transferencia: 0, Tarjeta: 0, 'Crédito': 0 };
  ventas.forEach(function(v) {
    var d = new Date(v.Fecha);
    if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
      var m = v.MetodoPago || 'Efectivo';
      metodoPagoDistribucion[m] = (metodoPagoDistribucion[m] || 0) + (parseFloat(v.Total) || 0);
    }
  });

  return {
    ventasHoy: ventasHoy,
    ventasMes: ventasMes,
    ventasMesAnterior: ventasMesAnterior,
    crecimientoMes: crecimientoMes,
    gastosMes: gastosMes,
    utilidadMes: utilidadMes,
    totalClientes: clientes.length,
    totalProductos: productos.length,
    productosStockBajo: productosStockBajo,
    topProductos: topProductos,
    ventasPorDia: ventasPorDia,
    ventasPorCategoria: ventasPorCategoria,
    facturasPendientes: facturasPendientes,
    totalDeudaClientes: totalDeudaClientes,
    metodoPagoDistribucion: metodoPagoDistribucion
  };
}
