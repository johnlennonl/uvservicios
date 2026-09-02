/**
 * ==============================================================================
 * SERVICIO MODULAR DE EXPEDIENTES Y DOCUMENTOS HISTÓRICOS POR POZO
 * UV SERVICIOS - MÓDULO DE BASE DE DATOS
 * ==============================================================================
 * Este servicio gestiona las consultas a Supabase PostgreSQL (tabla `well_historical_documents`)
 * y el almacenamiento de archivos físicos en Supabase Storage (Bucket `expedientes-pozos`).
 */

import { supabase } from '../supabaseClient.js';
import { getActiveOperationalScope } from './operational-scope-context.js';

// Nombre constante del Bucket en Supabase Storage
const BUCKET_NAME = 'expedientes-pozos';

/**
 * Normaliza nombres de archivos para evitar caracteres especiales en el almacenamiento de Supabase.
 * @param {string} fileName - Nombre del archivo original.
 * @returns {string} Nombre limpio sin tildes ni caracteres inválidos.
 */
function sanitizeFileName(fileName = '') {
    return String(fileName)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimina acentos y tildes
        .replace(/[^a-zA-Z0-9._-]/g, '_'); // Reemplaza símbolos extraños por guiones bajos
}

function normalizeOperationalScopeValue(value = '') {
    return String(value || getActiveOperationalScope() || 'ceiba_tomoporo').trim().toLowerCase() || 'ceiba_tomoporo';
}

function isMissingColumnError(error, columnName) {
    const message = String(error?.message || error || '');
    return new RegExp(columnName, 'i').test(message) && /column|schema|cache|could not find/i.test(message);
}

function isMissingOperationalScopeColumn(error) {
    return isMissingColumnError(error, 'operational_scope');
}

function isMissingDeletedAtColumn(error) {
    return isMissingColumnError(error, 'deleted_at');
}

async function compressImageIfNeeded(file) {
    // Si no es imagen o su tamaño es menor a 400KB, no hace falta comprimir
    if (!file || !file.type || !file.type.startsWith('image/') || file.size < 400 * 1024) {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Redimensionar si la resolución es muy alta (máximo 1600px en el lado más largo)
                const maxDim = 1600;
                let width = img.width;
                let height = img.height;
                
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }
                    
                    let newName = file.name;
                    if (!newName.toLowerCase().endsWith('.jpg') && !newName.toLowerCase().endsWith('.jpeg')) {
                        const parts = newName.split('.');
                        if (parts.length > 1) {
                            parts.pop();
                        }
                        newName = parts.join('.') + '.jpg';
                    }
                    
                    try {
                        const compressedFile = new File([blob], newName, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        console.log(`[ImageCompression] ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) -> Comprimido a ${newName} (${(compressedFile.size / 1024).toFixed(1)}KB)`);
                        resolve(compressedFile);
                    } catch (e) {
                        // Fallback si new File() lanza excepción (Safari antiguo)
                        blob.name = newName;
                        resolve(blob);
                    }
                }, 'image/jpeg', 0.75); // 75% de calidad de compresión
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

/**
 * Consulta la lista de documentos de un pozo con filtros opcionales por categoría, fecha y texto.
 * 
 * @param {Object} options - Parámetros de consulta
 * @param {string} options.pozoName - Nombre del pozo (ej: 'CEI-0003').
 * @param {string} [options.category] - Categoría opcional ('SIMULACIONES', 'INFORMES_TECNICOS', etc.).
 * @param {string} [options.startDate] - Fecha de inicio YYYY-MM-DD.
 * @param {string} [options.endDate] - Fecha de fin YYYY-MM-DD.
 * @param {string} [options.searchKeyword] - Texto a buscar en el nombre del archivo o descripción.
 * @returns {Promise<Array>} Lista de registros documentales.
 */
export async function getWellDocuments({ pozoName = '', category = null, startDate = null, endDate = null, searchKeyword = '', operationalScope = null, folderId = undefined } = {}) {
    try {
        const normalizedOperationalScope = normalizeOperationalScopeValue(operationalScope);
        let query = supabase
            .from('well_historical_documents')
            .select('*')
            .is('deleted_at', null)
            .order('fecha_documento', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        const isVirtualWell = pozoName === '_GENERAL' || pozoName === '_GERENCIAL';
        if (normalizedOperationalScope && !isVirtualWell) {
            query = query.or(`operational_scope.eq.${normalizedOperationalScope},operational_scope.is.null`);
        }

        // Filtrar por pozo específico si se indica
        if (pozoName && pozoName !== 'TODOS') {
            query = query.eq('pozo_name', pozoName.trim().toUpperCase());
        }

        // Filtrar por carpeta virtual (solo si no hay búsqueda activa)
        if (!searchKeyword && folderId !== undefined) {
            if (folderId === null) {
                query = query.is('folder_id', null);
            } else if (category && category !== 'TODAS') {
                query = query.or(`folder_id.eq.${folderId},and(folder_id.is.null,categoria.eq.${category.trim().toUpperCase()})`);
            } else {
                query = query.eq('folder_id', folderId);
            }
        }

        // Filtrar por categoría temática (si no hay filtro de carpeta que lo reemplace)
        if (category && category !== 'TODAS' && folderId === undefined) {
            query = query.eq('categoria', category.trim().toUpperCase());
        }

        // Filtrar por rango de fechas
        if (startDate) {
            query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
        }
        if (endDate) {
            query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
        }

        let { data, error } = await query;
        if (error && (isMissingColumnError(error, 'fecha_documento') || isMissingOperationalScopeColumn(error) || isMissingDeletedAtColumn(error))) {
            console.warn('[well-documents-service] Error de esquema (fecha_documento, operational_scope o deleted_at no existen); reintentando con consulta compatible.');
            
            let fallbackQuery = supabase
                .from('well_historical_documents')
                .select('*');
            
            if (!isMissingDeletedAtColumn(error)) {
                fallbackQuery = fallbackQuery.is('deleted_at', null);
            }
            
            // Decidir ordenamiento
            if (!isMissingColumnError(error, 'fecha_documento')) {
                fallbackQuery = fallbackQuery.order('fecha_documento', { ascending: false, nullsFirst: false });
            }
            fallbackQuery = fallbackQuery.order('created_at', { ascending: false });
            
            // Re-aplicar filtros
            if (!isMissingOperationalScopeColumn(error) && normalizedOperationalScope && !isVirtualWell) {
                fallbackQuery = fallbackQuery.or(`operational_scope.eq.${normalizedOperationalScope},operational_scope.is.null`);
            }
            if (pozoName && pozoName !== 'TODOS') {
                fallbackQuery = fallbackQuery.eq('pozo_name', pozoName.trim().toUpperCase());
            }
            if (!searchKeyword && folderId !== undefined) {
                if (folderId === null) {
                    fallbackQuery = fallbackQuery.is('folder_id', null);
                } else if (category && category !== 'TODAS') {
                    fallbackQuery = fallbackQuery.or(`folder_id.eq.${folderId},and(folder_id.is.null,categoria.eq.${category.trim().toUpperCase()})`);
                } else {
                    fallbackQuery = fallbackQuery.eq('folder_id', folderId);
                }
            }
            if (category && category !== 'TODAS' && folderId === undefined) {
                fallbackQuery = fallbackQuery.eq('categoria', category.trim().toUpperCase());
            }
            if (startDate) {
                fallbackQuery = fallbackQuery.gte('created_at', `${startDate}T00:00:00.000Z`);
            }
            if (endDate) {
                fallbackQuery = fallbackQuery.lte('created_at', `${endDate}T23:59:59.999Z`);
            }
            
            const fallbackResult = await fallbackQuery;
            data = fallbackResult.data;
            error = fallbackResult.error;
        }
        if (error) throw error;

        let results = data || [];

        // Filtrar localmente por palabra clave si se proporcionó un término de búsqueda
        if (searchKeyword && searchKeyword.trim()) {
            const term = searchKeyword.trim().toLowerCase();
            results = results.filter(doc => {
                const categoryClean = String(doc.categoria || '').replace(/_/g, ' ').toLowerCase();
                return (doc.nombre_archivo && doc.nombre_archivo.toLowerCase().includes(term)) ||
                       (doc.descripcion && doc.descripcion.toLowerCase().includes(term)) ||
                       (doc.uploaded_by && doc.uploaded_by.toLowerCase().includes(term)) ||
                       (doc.categoria && doc.categoria.toLowerCase().includes(term.replace(/\s+/g, '_'))) ||
                       (categoryClean && categoryClean.includes(term));
            });
        }

        return results;

    } catch (err) {
        console.error('[well-documents-service] Error obteniendo documentos del pozo:', err);
        throw err;
    }
}

/**
 * Obtiene el conteo total de documentos agrupados por pozo y por categoría.
 * Útil para mostrar contadores en las tarjetas de la vista principal.
 * @returns {Promise<Object>} Objeto estructurado { pozoName: { total: N, categorias: { SIMULACIONES: X, ... } } }
 */
export async function getWellDocumentSummaryCounts({ operationalScope = null } = {}) {
    try {
        const normalizedOperationalScope = normalizeOperationalScopeValue(operationalScope);
        let query = supabase
            .from('well_historical_documents')
            .select('pozo_name, categoria, operational_scope')
            .is('deleted_at', null);

        if (normalizedOperationalScope) {
            query = query.or(`operational_scope.eq.${normalizedOperationalScope},operational_scope.is.null`);
        }

        let { data, error } = await query;
        if (error && (isMissingOperationalScopeColumn(error) || isMissingDeletedAtColumn(error))) {
            console.warn('[well-documents-service] La columna operational_scope o deleted_at no existe; usando consulta compatible.');
            
            let fallbackQuery = supabase
                .from('well_historical_documents')
                .select('pozo_name, categoria');
                
            if (!isMissingOperationalScopeColumn(error)) {
                fallbackQuery = supabase
                    .from('well_historical_documents')
                    .select('pozo_name, categoria, operational_scope');
                if (normalizedOperationalScope) {
                    fallbackQuery = fallbackQuery.or(`operational_scope.eq.${normalizedOperationalScope},operational_scope.is.null`);
                }
            }
            
            if (!isMissingDeletedAtColumn(error)) {
                fallbackQuery = fallbackQuery.is('deleted_at', null);
            }
            
            const fallbackResult = await fallbackQuery;
            data = fallbackResult.data;
            error = fallbackResult.error;
        }

        if (error) throw error;

        const summary = {};
        (data || []).forEach(row => {
            const pozo = String(row.pozo_name || '').toUpperCase();
            const cat = String(row.categoria || '').toUpperCase();
            if (!summary[pozo]) {
                summary[pozo] = { total: 0, categories: {} };
            }
            summary[pozo].total += 1;
            summary[pozo].categories[cat] = (summary[pozo].categories[cat] || 0) + 1;
        });

        return summary;
    } catch (err) {
        console.error('[well-documents-service] Error obteniendo resumen de contadores:', err);
        return {};
    }
}

/**
 * Sube un archivo físico a Supabase Storage y registra su metadata en PostgreSQL.
 * 
 * @param {Object} params - Datos del archivo a cargar
 * @param {File} params.file - Objeto File seleccionado por el usuario.
 * @param {string} params.pozoName - Nombre del pozo asignado (ej: 'CEI-0003').
 * @param {string} params.category - Categoría ('SIMULACIONES', 'INFORMES_TECNICOS', etc.).
 * @param {string} [params.description] - Breve descripción o nota técnica.
 * @param {string} [params.uploadedBy] - Nombre del usuario/técnico que realiza la carga.
 * @returns {Promise<Object>} Registro del documento recién creado.
 */
export async function uploadWellDocument({ file, pozoName, category, description = '', uploadedBy = 'Sistema', operationalScope = null, documentDate = null, folderId = null }) {
    if (!file) throw new Error('Debes seleccionar un archivo para cargar.');
    if (!(file instanceof Blob) && !(file instanceof File)) {
        throw new Error('El archivo requiere ser vuelto a seleccionar desde tu dispositivo.');
    }
    if (!pozoName) throw new Error('El nombre del pozo es obligatorio.');
    if (!category) throw new Error('Debes seleccionar una categoría temática.');

    const cleanPozo = String(pozoName).trim().toUpperCase();
    const cleanCategory = String(category).trim().toUpperCase();
    const cleanOperationalScope = normalizeOperationalScopeValue(operationalScope);

    // Intentar comprimir la imagen en el cliente si es necesario
    let fileToUpload = file;
    try {
        fileToUpload = await compressImageIfNeeded(file);
    } catch (compressErr) {
        console.warn('[well-documents-service] Error comprimiendo imagen; se subirá el archivo original:', compressErr);
    }

    const sanitizedName = sanitizeFileName(fileToUpload.name);
    const timeStamp = Date.now();
    
    // Generar ruta única en el Bucket de Storage: contrato/pozo/categoria/timestamp_nombre.ext
    const filePath = `${cleanOperationalScope}/${cleanPozo}/${cleanCategory}/${timeStamp}_${sanitizedName}`;

    // Si es un registro de Echometer y no viene con folderId, autodetectar la subcarpeta correspondiente
    let resolvedFolderId = folderId;
    if (cleanCategory === 'REGISTROS_ECHOMETER' && !resolvedFolderId) {
        try {
            const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || '';
            const targetSubName = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(fileExt)
                ? 'INFORMES DE PRUEBAS (PDF)'
                : 'ARCHIVOS DE DATOS (.028, .TWM)';

            const { data: parentFolder } = await supabase
                .from('well_document_folders')
                .select('id')
                .eq('pozo_name', cleanPozo)
                .eq('name', 'REGISTROS ECHOMETER (TAM)')
                .is('parent_id', null)
                .maybeSingle();

            if (parentFolder) {
                const { data: subFolder } = await supabase
                    .from('well_document_folders')
                    .select('id')
                    .eq('pozo_name', cleanPozo)
                    .eq('name', targetSubName)
                    .eq('parent_id', parentFolder.id)
                    .maybeSingle();

                if (subFolder) {
                    resolvedFolderId = subFolder.id;
                }
            }
        } catch (err) {
            console.warn('[well-documents-service] Error categorizando subcarpeta para Echometer:', err);
        }
    }

    try {
        // 1. Subir archivo a Supabase Storage Bucket
        const { error: uploadError } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(filePath, fileToUpload, {
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) {
            console.error('[well-documents-service] Error subiendo archivo a Supabase Storage:', uploadError);
            throw new Error(`Error en el almacenamiento de Supabase Storage: ${uploadError.message}`);
        }

        // Obtener extensión/tipo de archivo
        const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'doc';

        // 2. Insertar metadata en la tabla well_historical_documents
        const isVirtual = cleanPozo === '_GENERAL' || cleanPozo === '_GERENCIAL';
        const documentPayload = {
            operational_scope: isVirtual ? null : cleanOperationalScope,
            pozo_name: cleanPozo,
            categoria: cleanCategory,
            nombre_archivo: fileToUpload.name,
            file_path: filePath,
            file_size: fileToUpload.size || 0,
            file_type: fileExt,
            descripcion: String(description || '').trim(),
            uploaded_by: String(uploadedBy || 'Administrador').trim(),
            fecha_documento: documentDate || new Date().toISOString().split('T')[0],
            folder_id: resolvedFolderId || null
        };

        let { data: dbData, error: dbError } = await supabase
            .from('well_historical_documents')
            .insert([documentPayload])
            .select()
            .single();

        if (dbError) {
            console.warn('[well-documents-service] Primer intento de insert fallo; reintentando con payload minimo:', dbError.message);
            const minimalPayload = {
                pozo_name: cleanPozo,
                categoria: cleanCategory,
                nombre_archivo: fileToUpload.name,
                file_path: filePath,
                file_size: fileToUpload.size || 0,
                file_type: fileExt,
                descripcion: String(description || '').trim(),
                uploaded_by: String(uploadedBy || 'Administrador').trim()
            };
            const retryResult = await supabase
                .from('well_historical_documents')
                .insert([minimalPayload])
                .select();
            
            if (!retryResult.error) {
                dbData = (retryResult.data && retryResult.data[0]) ? retryResult.data[0] : null;
                dbError = null;
            } else {
                dbError = retryResult.error;
            }
        }

        if (dbError) {
            console.error('[well-documents-service] Error registrando metadata en base de datos:', dbError);
            throw new Error(`Error registrando metadata: ${dbError.message}`);
        }

        return dbData;

    } catch (err) {
        console.error('[well-documents-service] Error completo en proceso de carga:', err);
        throw err;
    }
}

/**
 * Obtiene la URL pública o el enlace firmado de descarga para un archivo.
 * 
 * @param {string} filePath - Ruta del archivo almacenado en Supabase Storage.
 * @returns {string} Enlace URL directo para descargar/abrir el documento.
 */
const signedUrlsCache = new Map();

export async function getDocumentInlineUrl(filePath = '', expiresInSeconds = 3600) {
    if (!filePath) return '#';
    try {
        // Generar URL firmada con entrega INLINE para abrir imágenes y PDFs directamente en la pestaña del navegador
        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, expiresInSeconds, { download: false });

        if (!error && data?.signedUrl) {
            return data.signedUrl;
        }
    } catch (err) {
        console.warn('[well-documents-service] Advertencia generando URL inline:', err);
    }

    const { data } = supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    return data?.publicUrl || '#';
}

export async function getDocumentDownloadUrl(filePath = '', expiresInSeconds = 3600, customFileName = '') {
    if (!filePath) return '#';
    
    let fileNameToUse = customFileName;
    if (!fileNameToUse) {
        const rawBase = String(filePath).split('/').pop() || '';
        const cleanSegment = rawBase.replace(/^[a-f0-9-]{36}_?/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
        fileNameToUse = cleanSegment.length > 3 ? cleanSegment.toUpperCase() : `DOCUMENTO_SOPORTE_${new Date().toISOString().slice(0, 10)}.xlsx`;
    }

    try {
        // Generar URL firmada temporal con header Content-Disposition para forzar descarga física
        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, expiresInSeconds, { download: fileNameToUse });

        if (!error && data?.signedUrl) {
            return data.signedUrl;
        }
    } catch (err) {
        console.warn('[well-documents-service] Advertencia generando URL firmada:', err);
    }

    // Fallback a URL pública si aplica
    const { data } = supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    return data?.publicUrl || '#';
}

/**
 * Obtiene múltiples URLs firmadas en lote (batch) de forma eficiente.
 * 
 * @param {string[]} filePaths - Lista de rutas de archivos.
 * @returns {Promise<Object>} Mapa asociando cada filePath con su URL firmada o pública.
 */
export async function getDocumentDownloadUrls(filePaths = [], expiresInSeconds = 3600) {
    if (!Array.isArray(filePaths) || !filePaths.length) return {};

    const results = {};
    const missingPaths = [];

    for (const path of filePaths) {
        if (!path) continue;
        if (signedUrlsCache.has(path)) {
            results[path] = signedUrlsCache.get(path);
        } else {
            missingPaths.push(path);
        }
    }

    if (missingPaths.length > 0) {
        try {
            const { data, error } = await supabase
                .storage
                .from(BUCKET_NAME)
                .createSignedUrls(missingPaths, expiresInSeconds);

            if (!error && Array.isArray(data)) {
                for (const item of data) {
                    if (item.signedUrl) {
                        const pathKey = item.path || missingPaths.find(p => p.includes(item.signedUrl.split('?')[0].split('/').pop()));
                        const resolvedPath = pathKey || item.path;
                        if (resolvedPath) {
                            signedUrlsCache.set(resolvedPath, item.signedUrl);
                            results[resolvedPath] = item.signedUrl;
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[well-documents-service] Error generating batch signed URLs:', err);
        }
    }

    // Fallback checks
    for (const path of filePaths) {
        if (!path) continue;
        if (!results[path]) {
            const { data } = supabase
                .storage
                .from(BUCKET_NAME)
                .getPublicUrl(path);
            results[path] = data?.publicUrl || '#';
        }
    }

    return results;
}

/**
 * Aplica de forma dinámica una marca de agua semitransparente sobre una imagen utilizando un Canvas HTML5.
 * 
 * @param {string} imageUrl - URL origen de la imagen.
 * @param {string} watermarkText - Texto a incrustar como marca de agua.
 * @returns {Promise<string>} Data URL (base64) de la imagen procesada con la marca de agua integrada.
 */
export function applyWatermarkToImage(imageUrl, watermarkText = 'UV SERVICIOS') {
    return new Promise((resolve) => {
        if (!imageUrl || imageUrl === '#') {
            resolve(imageUrl);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous'; // Evita errores de Canvas manchado (CORS)
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(imageUrl);
                    return;
                }

                // Dibujar imagen original
                ctx.drawImage(img, 0, 0);

                // Configuración de marca de agua principal
                const fontSize = Math.max(16, Math.floor(canvas.width * 0.04));
                ctx.font = `bold ${fontSize}px 'Outfit', 'Inter', sans-serif`;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
                ctx.lineWidth = Math.max(1, fontSize / 12);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Rotar el contexto para marca de agua diagonal en el centro
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(-28 * Math.PI / 180);

                // Dibujar texto principal
                ctx.fillText(watermarkText, 0, 0);
                ctx.strokeText(watermarkText, 0, 0);

                // Reestablecer transformaciones
                ctx.setTransform(1, 0, 0, 1, 0, 0);

                // Dibujar marca de agua secundaria en esquina inferior derecha
                ctx.font = `bold ${Math.max(11, fontSize / 1.8)}px 'Outfit', 'Inter', sans-serif`;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
                ctx.lineWidth = 1;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(watermarkText, canvas.width - 25, canvas.height - 25);
                ctx.strokeText(watermarkText, canvas.width - 25, canvas.height - 25);

                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (e) {
                console.warn('[Watermark] Canvas processing failed, falling back to original URL:', e);
                resolve(imageUrl);
            }
        };

        img.onerror = () => {
            resolve(imageUrl);
        };

        img.src = imageUrl;
    });
}

/**
 * Elimina un documento tanto de Supabase Storage como de la tabla de la base de datos.
 * 
 * @param {string} documentId - ID del registro en well_historical_documents.
 * @param {string} filePath - Ruta física del archivo en el Bucket.
 * @returns {Promise<boolean>} Retorna true si fue eliminado exitosamente.
 */
export async function deleteWellDocument(documentId) {
    if (!documentId) throw new Error('ID de documento no proporcionado.');

    try {
        const { error } = await supabase
            .from('well_historical_documents')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', documentId);

        if (error) throw error;
        return true;
    } catch (err) {
        console.error('[well-documents-service] Error eliminando documento (soft delete):', err);
        throw err;
    }
}

/**
 * Restaura un documento eliminado lógicamente (borra el valor de deleted_at).
 * 
 * @param {string} documentId - ID del registro.
 * @returns {Promise<boolean>} Retorna true si fue restaurado.
 */
export async function restoreWellDocument(documentId) {
    if (!documentId) throw new Error('ID de documento no proporcionado.');

    try {
        const { error } = await supabase
            .from('well_historical_documents')
            .update({ deleted_at: null })
            .eq('id', documentId);

        if (error) throw error;
        return true;
    } catch (err) {
        console.error('[well-documents-service] Error restaurando documento:', err);
        throw err;
    }
}

/**
 * Elimina físicamente un documento (de Storage y de la base de datos de manera definitiva).
 * 
 * @param {string} documentId - ID del registro.
 * @param {string} filePath - Ruta del archivo en el Storage Bucket.
 * @returns {Promise<boolean>} Retorna true si fue eliminado físicamente.
 */
export async function permanentlyDeleteWellDocument(documentId, filePath) {
    if (!documentId) throw new Error('ID de documento no proporcionado.');

    try {
        // 1. Eliminar archivo físico de Supabase Storage
        if (filePath) {
            const { error: storageError } = await supabase
                .storage
                .from(BUCKET_NAME)
                .remove([filePath]);

            if (storageError) {
                console.warn('[well-documents-service] Advertencia al remover de storage en eliminación definitiva:', storageError);
            }
        }

        // 2. Eliminar registro físico en PostgreSQL
        const { error: dbError } = await supabase
            .from('well_historical_documents')
            .delete()
            .eq('id', documentId);

        if (dbError) throw dbError;
        return true;
    } catch (err) {
        console.error('[well-documents-service] Error en eliminación permanente de documento:', err);
        throw err;
    }
}

/**
 * Consulta todos los documentos eliminados lógicamente (deleted_at IS NOT NULL) para la papelera.
 * 
 * @param {Object} params
 * @param {string} [params.operationalScope] - Contrato activo.
 * @returns {Promise<Array>} Listado de registros eliminados.
 */
export async function getDeletedWellDocuments({ operationalScope = null } = {}) {
    try {
        const normalizedOperationalScope = normalizeOperationalScopeValue(operationalScope);
        let query = supabase
            .from('well_historical_documents')
            .select('*, well_document_folders(name)')
            .not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false });

        if (normalizedOperationalScope) {
            query = query.or(`operational_scope.eq.${normalizedOperationalScope},operational_scope.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('[well-documents-service] Error obteniendo documentos en papelera:', err);
        throw err;
    }
}

/**
 * Actualiza la descripción (comentario/nota técnica) de un documento histórico.
 * 
 * @param {string} documentId - ID del registro en well_historical_documents.
 * @param {string} description - Nueva descripción o nota técnica.
 * @returns {Promise<Object>} Registro del documento actualizado.
 */
export async function updateWellDocumentDescription(documentId, description) {
    if (!documentId) throw new Error('ID de documento no proporcionado.');

    try {
        // Try with original type first (could be UUID or string-represented bigint)
        let { data, error } = await supabase
            .from('well_historical_documents')
            .update({ descripcion: String(description || '').trim() })
            .eq('id', documentId)
            .select();

        if (error) throw error;

        // If 0 rows updated and documentId is a numeric string, try parsing to number
        if ((!data || data.length === 0) && !isNaN(Number(documentId))) {
            const numResult = await supabase
                .from('well_historical_documents')
                .update({ descripcion: String(description || '').trim() })
                .eq('id', Number(documentId))
                .select();
            
            if (numResult.error) throw numResult.error;
            data = numResult.data;
        }

        if (!data || data.length === 0) {
            throw new Error('No se encontró el archivo adjunto para actualizar su comentario.');
        }

        return data[0];
    } catch (err) {
        console.error('[well-documents-service] Error actualizando descripción del documento:', err);
        throw err;
    }
}

/**
 * Actualiza la metadata (fecha y descripción/nota técnica) de un documento histórico.
 * 
 * @param {string} documentId - ID del registro en well_historical_documents.
 * @param {Object} metadata - Datos a actualizar.
 * @param {string} [metadata.description] - Nueva descripción.
 * @param {string} [metadata.documentDate] - Nueva fecha de documento (YYYY-MM-DD).
 * @returns {Promise<Object>} Registro del documento actualizado.
 */
export async function updateWellDocumentMetadata(documentId, { description = null, documentDate = null } = {}) {
    if (!documentId) throw new Error('ID de documento no proporcionado.');

    try {
        const updatePayload = {};
        if (description !== null) updatePayload.descripcion = String(description).trim();
        if (documentDate !== null) updatePayload.fecha_documento = documentDate;

        let { data, error } = await supabase
            .from('well_historical_documents')
            .update(updatePayload)
            .eq('id', documentId)
            .select();

        if (error) {
            // Si falla porque no existe la columna fecha_documento, la quitamos y reintentamos
            if (isMissingColumnError(error, 'fecha_documento')) {
                console.warn('[well-documents-service] La columna fecha_documento no existe; reintentando solo con descripcion.');
                delete updatePayload.fecha_documento;
                if (Object.keys(updatePayload).length > 0) {
                    const retryResult = await supabase
                        .from('well_historical_documents')
                        .update(updatePayload)
                        .eq('id', documentId)
                        .select();
                    data = retryResult.data;
                    error = retryResult.error;
                }
            }
        }

        if (error) throw error;

        // Intentar fallback numérico por compatibilidad de tipos (id número/UUID)
        if ((!data || data.length === 0) && !isNaN(Number(documentId))) {
            const numResult = await supabase
                .from('well_historical_documents')
                .update(updatePayload)
                .eq('id', Number(documentId))
                .select();
            if (numResult.error) throw numResult.error;
            data = numResult.data;
        }

        if (!data || data.length === 0) {
            throw new Error('No se encontró el archivo adjunto para actualizar.');
        }

        return data[0];
    } catch (err) {
        console.error('[well-documents-service] Error actualizando metadatos del documento:', err);
        throw err;
    }
}

/**
 * ==============================================================================
 * SERVICIOS ADICIONALES PARA LA GESTIÓN DE CARPETAS Y SUBCARPETAS VIRTUALES
 * ==============================================================================
 */

/**
 * Crea una nueva carpeta virtual para un pozo y contrato específicos.
 */
export async function createFolder({ pozoName, name, parentId = null, operationalScope = null, description = '', icon = 'fa-solid fa-folder-closed' }) {
    if (!pozoName) throw new Error('El nombre del pozo es obligatorio.');
    if (!name || !name.trim()) throw new Error('El nombre de la carpeta es obligatorio.');

    const cleanScope = normalizeOperationalScopeValue(operationalScope);
    const cleanName = String(name).trim();

    const isVirtual = String(pozoName).trim().toUpperCase() === '_GENERAL' || String(pozoName).trim().toUpperCase() === '_GERENCIAL';
    const insertPayload = {
        operational_scope: isVirtual ? null : cleanScope,
        pozo_name: String(pozoName).trim().toUpperCase(),
        parent_id: parentId,
        name: cleanName,
        description: String(description || '').trim(),
        icon: String(icon || 'fa-solid fa-folder-closed').trim()
    };

    const { data, error } = await supabase
        .from('well_document_folders')
        .insert([insertPayload])
        .select()
        .single();

    if (error) {
        console.error('[well-documents-service] Error creando carpeta:', error);
        throw error;
    }
    return data;
}

/**
 * Obtiene las subcarpetas del directorio actual.
 */
export async function getFolders({ pozoName, parentId = null, operationalScope = null }) {
    if (!pozoName) throw new Error('El nombre del pozo es obligatorio.');
    const cleanScope = normalizeOperationalScopeValue(operationalScope);

    let query = supabase
        .from('well_document_folders')
        .select('*')
        .eq('pozo_name', String(pozoName).trim().toUpperCase())
        .order('name', { ascending: true });

    const isVirtualWell = String(pozoName).trim().toUpperCase() === '_GENERAL' || String(pozoName).trim().toUpperCase() === '_GERENCIAL';
    if (cleanScope && !isVirtualWell) {
        query = query.or(`operational_scope.eq.${cleanScope},operational_scope.is.null`);
    }

    if (parentId === null) {
        query = query.is('parent_id', null);
    } else {
        query = query.eq('parent_id', parentId);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[well-documents-service] Error obteniendo carpetas:', error);
        throw error;
    }
    return data || [];
}

/**
 * Obtiene los detalles de una carpeta específica por su ID.
 */
export async function getFolderById(folderId) {
    if (!folderId) return null;
    const { data, error } = await supabase
        .from('well_document_folders')
        .select('*')
        .eq('id', folderId)
        .single();

    if (error) {
        console.error('[well-documents-service] Error obteniendo carpeta por ID:', error);
        return null;
    }
    return data;
}

/**
 * Elimina una carpeta de la base de datos (con borrado en cascada en la BD).
 */
export async function deleteFolder(folderId) {
    if (!folderId) throw new Error('ID de carpeta no proporcionado.');

    const { error } = await supabase
        .from('well_document_folders')
        .delete()
        .eq('id', folderId);

    if (error) {
        console.error('[well-documents-service] Error eliminando carpeta:', error);
        throw error;
    }
    return true;
}
