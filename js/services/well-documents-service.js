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

function isMissingOperationalScopeColumn(error) {
    const message = String(error?.message || error || '');
    return /operational_scope/i.test(message) && /column|schema|cache|could not find/i.test(message);
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
export async function getWellDocuments({ pozoName = '', category = null, startDate = null, endDate = null, searchKeyword = '', operationalScope = null } = {}) {
    try {
        const normalizedOperationalScope = normalizeOperationalScopeValue(operationalScope);
        let query = supabase
            .from('well_historical_documents')
            .select('*')
            .order('created_at', { ascending: false });

        if (normalizedOperationalScope) {
            query = query.or(`operational_scope.eq.${normalizedOperationalScope},operational_scope.is.null`);
        }

        // Filtrar por pozo específico si se indica
        if (pozoName && pozoName !== 'TODOS') {
            query = query.eq('pozo_name', pozoName.trim().toUpperCase());
        }

        // Filtrar por categoría temática
        if (category && category !== 'TODAS') {
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
        if (error && isMissingOperationalScopeColumn(error)) {
            console.warn('[well-documents-service] La columna operational_scope no existe aun; usando consulta legacy de documentos.');
            let legacyQuery = supabase
                .from('well_historical_documents')
                .select('*')
                .order('created_at', { ascending: false });

            if (pozoName && pozoName !== 'TODOS') {
                legacyQuery = legacyQuery.eq('pozo_name', pozoName.trim().toUpperCase());
            }
            if (category && category !== 'TODAS') {
                legacyQuery = legacyQuery.eq('categoria', category.trim().toUpperCase());
            }
            if (startDate) {
                legacyQuery = legacyQuery.gte('created_at', `${startDate}T00:00:00.000Z`);
            }
            if (endDate) {
                legacyQuery = legacyQuery.lte('created_at', `${endDate}T23:59:59.999Z`);
            }

            const legacyResult = await legacyQuery;
            data = legacyResult.data;
            error = legacyResult.error;
        }
        if (error) throw error;

        let results = data || [];

        // Filtrar localmente por palabra clave si se proporcionó un término de búsqueda
        if (searchKeyword && searchKeyword.trim()) {
            const term = searchKeyword.trim().toLowerCase();
            results = results.filter(doc => 
                (doc.nombre_archivo && doc.nombre_archivo.toLowerCase().includes(term)) ||
                (doc.descripcion && doc.descripcion.toLowerCase().includes(term)) ||
                (doc.uploaded_by && doc.uploaded_by.toLowerCase().includes(term))
            );
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
            .select('pozo_name, categoria, operational_scope');

        if (normalizedOperationalScope) {
            query = query.or(`operational_scope.eq.${normalizedOperationalScope},operational_scope.is.null`);
        }

        let { data, error } = await query;
        if (error && isMissingOperationalScopeColumn(error)) {
            console.warn('[well-documents-service] La columna operational_scope no existe aun; usando conteo legacy de documentos.');
            const legacyResult = await supabase
                .from('well_historical_documents')
                .select('pozo_name, categoria');
            data = legacyResult.data;
            error = legacyResult.error;
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
export async function uploadWellDocument({ file, pozoName, category, description = '', uploadedBy = 'Sistema', operationalScope = null }) {
    if (!file) throw new Error('Debes seleccionar un archivo para cargar.');
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

    try {
        // 1. Subir archivo a Supabase Storage Bucket
        const { error: uploadError } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(filePath, fileToUpload, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('[well-documents-service] Error subiendo archivo a Supabase Storage:', uploadError);
            throw new Error(`Error en el almacenamiento de Supabase Storage: ${uploadError.message}`);
        }

        // Obtener extensión/tipo de archivo
        const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'doc';

        // 2. Insertar metadata en la tabla well_historical_documents
        const documentPayload = {
            operational_scope: cleanOperationalScope,
            pozo_name: cleanPozo,
            categoria: cleanCategory,
            nombre_archivo: fileToUpload.name,
            file_path: filePath,
            file_size: fileToUpload.size || 0,
            file_type: fileExt,
            descripcion: String(description || '').trim(),
            uploaded_by: String(uploadedBy || 'Administrador').trim()
        };

        let { data: dbData, error: dbError } = await supabase
            .from('well_historical_documents')
            .insert([documentPayload])
            .select()
            .single();

        if (dbError && isMissingOperationalScopeColumn(dbError)) {
            console.warn('[well-documents-service] La columna operational_scope no existe aun; registrando metadata legacy.');
            const legacyPayload = { ...documentPayload };
            delete legacyPayload.operational_scope;
            const legacyResult = await supabase
                .from('well_historical_documents')
                .insert([legacyPayload])
                .select()
                .single();
            dbData = legacyResult.data;
            dbError = legacyResult.error;
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
export async function getDocumentDownloadUrl(filePath = '', expiresInSeconds = 3600) {
    if (!filePath) return '#';

    try {
        // Generar URL firmada temporal (válida por 1 hora) para Bucket Privado
        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, expiresInSeconds);

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
 * Elimina un documento tanto de Supabase Storage como de la tabla de la base de datos.
 * 
 * @param {string} documentId - ID del registro en well_historical_documents.
 * @param {string} filePath - Ruta física del archivo en el Bucket.
 * @returns {Promise<boolean>} Retorna true si fue eliminado exitosamente.
 */
export async function deleteWellDocument(documentId, filePath) {
    if (!documentId) throw new Error('ID de documento no proporcionado.');

    try {
        // 1. Eliminar archivo de Supabase Storage si se tiene la ruta
        if (filePath) {
            const { error: storageError } = await supabase
                .storage
                .from(BUCKET_NAME)
                .remove([filePath]);

            if (storageError) {
                console.warn('[well-documents-service] Advertencia eliminando archivo de Storage:', storageError);
            }
        }

        // 2. Eliminar registro en la base de datos PostgreSQL
        const { error: dbError } = await supabase
            .from('well_historical_documents')
            .delete()
            .eq('id', documentId);

        if (dbError) throw dbError;

        return true;

    } catch (err) {
        console.error('[well-documents-service] Error eliminando documento:', err);
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
