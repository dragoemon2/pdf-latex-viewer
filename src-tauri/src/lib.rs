use std::collections::HashMap;
use std::fs;
use lopdf::{Document, Object, Dictionary, StringFormat};
use std::str;
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};

struct StartupFile(Mutex<Option<String>>);

// 無理やりスレッドセーフにするおまじない
unsafe impl Send for PdfiumWrapper {}
unsafe impl Sync for PdfiumWrapper {}

struct PdfiumState {
    library: Mutex<PdfiumWrapper>,
}

fn init_pdfium() -> Pdfium {
    // プロジェクトルートの libs/libpdfium.so を指定
    // ※ 本番ビルド時は resource ディレクトリ等を見る必要があります
    let mut path = std::env::current_dir().unwrap();
    path.push("libs"); 
    
    // OSによってファイル名が違うので注意 (Linux: libpdfium.so, Mac: libpdfium.dylib, Win: pdfium.dll)
    // ここでは決め打ちしていますが、本来はOS判定推奨
    path.push("libpdfium.so"); 

    let bindings = Pdfium::bind_to_library(path.to_str().unwrap())
        .or_else(|_| Pdfium::bind_to_system_library())
        .expect("❌ Failed to bind to PDFium! Make sure libs/libpdfium.so exists.");

    Pdfium::new(bindings)
}

#[tauri::command]
fn get_pdf_page_count(state: State<PdfiumState>, path: String) -> Result<u16, String> {
    // ★ここを修正: ロックを取得して中身(.0)を取り出す
    let guard = state.library.lock().map_err(|e| e.to_string())?;
    let pdfium = &guard.0; 

    let document = pdfium.load_pdf_from_file(&path, None).map_err(|e| e.to_string())?;
    Ok(document.pages().len())
}

#[tauri::command]
fn save_pdf_with_annotations(path: String, annotations: Vec<AnnotationData>) -> Result<(), String> {
    // 1. PDFを読み込む
    let mut doc = Document::load(&path).map_err(|e| e.to_string())?;

    // 2. グループ化
    let mut annots_by_page: HashMap<u32, Vec<AnnotationData>> = HashMap::new();
    for ann in annotations {
        annots_by_page.entry(ann.page as u32).or_default().push(ann);
    }

    // 3. ページ構造取得
    let pages = doc.get_pages(); 

    // 4. 各ページ処理
    for (page_num, page_id) in pages {
        let mut new_annot_ids = Vec::new();

        if let Some(page_annots) = annots_by_page.get(&page_num) {
            let page_height = get_page_height(&doc, page_id).unwrap_or(842.0);

            for ann in page_annots {
                let pdf_y = page_height - ann.y as f32;
                let font_size = ann.font_size.unwrap_or(14.0);

                let mut annot_dict = Dictionary::new();
                annot_dict.set("Type", Object::Name(b"Annot".to_vec()));
                annot_dict.set("Subtype", Object::Name(b"FreeText".to_vec()));
                
                let da_str = format!("0 0 0 rg /Helv {} Tf", font_size);
                annot_dict.set("DA", Object::String(da_str.into_bytes(), StringFormat::Literal));
                
                annot_dict.set("Contents", Object::String(ann.content.clone().into_bytes(), StringFormat::Literal));
                
                annot_dict.set("Rect", Object::Array(vec![
                    Object::Real(ann.x as f32),
                    Object::Real(pdf_y - (font_size * 1.5)), 
                    Object::Real(ann.x as f32 + 200.0),       
                    Object::Real(pdf_y)
                ]));

                let annot_id = doc.add_object(annot_dict);
                new_annot_ids.push(Object::Reference(annot_id));
            }
        }

        // 5. ページの "Annots" を上書き (これで古いアノテーションへの参照が消え、重複が防げる)
        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(page_dict) = page_obj.as_dict_mut() {
                if new_annot_ids.is_empty() {
                    page_dict.remove(b"Annots");
                } else {
                    page_dict.set("Annots", Object::Array(new_annot_ids));
                }
            }
        }
    }

    // 保存
    doc.save(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_page_height(doc: &Document, page_id: lopdf::ObjectId) -> Option<f32> {
    let page_obj = doc.get_object(page_id).ok()?;
    let page_dict = page_obj.as_dict().ok()?;
    
    let media_box = page_dict.get(b"MediaBox").ok().and_then(|o| o.as_array().ok())?;
    
    if media_box.len() >= 4 {
        let y1 = media_box[1].as_f32().ok()?;
        let y2 = media_box[3].as_f32().ok()?;
        Some((y2 - y1).abs())
    } else {
        None
    }
}

#[tauri::command]
fn open_pdf_file(path: String) -> Result<String, String> {
    // 1. ファイルを読み込む
    let buffer = fs::read(&path).map_err(|e| e.to_string())?;

    // Base64エンコード
    use base64::{engine::general_purpose, Engine as _};
    let base64_str = general_purpose::STANDARD.encode(&bytes);
    
    // Data URIで返す
    Ok(format!("data:image/png;base64,{}", base64_str))
}

mod annotation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pdfium = init_pdfium();

    tauri::Builder::default()
        // Mutex<PdfiumWrapper> で包んで登録
        .manage(PdfiumState { library: Mutex::new(PdfiumWrapper(pdfium)) })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_pdf_file, 
            load_annotations, 
            save_pdf_with_annotations,
            get_startup_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}