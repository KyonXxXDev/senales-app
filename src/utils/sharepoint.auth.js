import { SP_CLIENT_ID, SP_CLIENT_SECRET, SP_TENANT_ID, SP_SITE_ID, SP_DRIVE_ID } from '../config/env.config.js';

export async function obtenerToken() {
  const tenantId = SP_TENANT_ID;
  const clientId = SP_CLIENT_ID;
  const clientSecret = SP_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Faltan variables de entorno para SharePoint: TENANT_ID, CLIENT_ID o CLIENT_SECRET');
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const bodyParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: bodyParams.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'No se pudo obtener el token de SharePoint');
  }

  return data.access_token;
}


{/*
  Obtener el DriveITEM ademas de listar las carpetas que se encuentran en el drive
*/} 
async function obtenerDrive() {
  const token = await obtenerToken();
  console.log(token);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SP_SITE_ID}/drive`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(data);
    throw new Error('No se pudo obtener el Drive');
  }

  console.log('✅ DRIVE ENCONTRADO');
  console.log({
    id: data.id,
    name: data.name,
    webUrl: data.webUrl
  });
}




async function listarArchivos() {
  const token = await obtenerToken();

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SP_SITE_ID}/drive/root/children`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(data);
    throw new Error('No se pudieron obtener las carpetas');
  }

  console.table(
    data.value.map(item => ({
      id: item.id,
      nombre: item.name,
      tipo: item.folder ? 'CARPETA' : 'ARCHIVO',
      url: item.webUrl
    }))
  );
}

// Para pruebas manuales: descomentar si se ejecuta directamente
// obtenerDrive().then(()=> {
//   listarArchivos();
// }).catch(console.error); 

export async function uploadFileToSharePoint(
  folderId,
  fileName,
  fileBuffer,
  mimeType
) {
  const token = await obtenerToken();

  const url =
    `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
    `/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType
    },
    body: fileBuffer
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(data);
    throw new Error(
      data.error?.message ||
      'Error al subir archivo a SharePoint'
    );
  }

  return {
    id: data.id,
    name: data.name,
    webUrl: data.webUrl,
    size: data.size,
    mimeType: data.file?.mimeType
  };
}

