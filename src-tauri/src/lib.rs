use std::{collections::HashMap};
use std::fs;
use lopdf::{Document, Object, Dictionary, StringFormat};
use std::str;
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};

use pdfium_render::prelude::*;
use base64::{engine::general_purpose, Engine as _};

use tauri::AppHandle;
use tauri::Manager;
use tauri::path::BaseDirectory;

struct StartupFile(Mutex<Option<String>>);


fn get_pdfium(handle: &AppHandle) -> Result<Pdfium, String> {
    let lib_path = handle
        .path()  // ← Manager trait
        .resolve("pdfium/libpdfium.so", BaseDirectory::Resource)
        .map_err(|e| format!("resource resolve error: {:?}", e))?;

    let bindings = Pdfium::bind_to_library(lib_path)
        .map_err(|e| format!("Pdfium bind error: {:?}", e))?;

    Ok(Pdfium::new(bindings))
}

// Reactから呼ばれるコマンド: 起動時のファイルパスを返す
#[tauri::command]
fn get_startup_file(state: State<StartupFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationData {
    page: u32,
    x: f64,
    y: f64,
    content: String,
    font_size: Option<f32>,
}

// ヘルパー関数: Objectからf64を取り出す
fn get_f64(obj: &Object) -> f64 {
    match *obj {
        Object::Real(v) => v as f64,
        Object::Integer(v) => v as f64,
        _ => 0.0,
    }
}

fn parse_font_size_from_da(da: &str) -> Option<f32> {
    let parts: Vec<&str> = da.split_whitespace().collect();
    for (i, part) in parts.iter().enumerate() {
        if *part == "Tf" && i > 0 {
            if let Ok(size) = parts[i - 1].parse::<f32>() {
                return Some(size);
            }
        }
    }
    None
}

#[tauri::command]
fn load_annotations(path: String) -> Result<Vec<AnnotationData>, String> {
    let doc = Document::load(&path).map_err(|e| e.to_string())?;
    let mut annotations = Vec::new();

    for (page_num, page_id) in doc.get_pages() {
        let page_dict = doc.get_object(page_id).and_then(|o| o.as_dict()).map_err(|e| e.to_string())?;
        
        let media_box = page_dict.get(b"MediaBox")
            .and_then(|o| o.as_array())
            .map(|a| a.iter().map(|f| get_f64(f)).collect::<Vec<f64>>())
            .unwrap_or(vec![0.0, 0.0, 595.0, 842.0]);
        let page_height = media_box[3];

        if let Ok(annots_obj) = page_dict.get(b"Annots") {
            let annots_list = match *annots_obj {
                Object::Reference(id) => {
                    doc.get_object(id).and_then(|o| o.as_array()).ok()
                },
                Object::Array(ref arr) => {
                    Some(arr)
                },
                _ => None
            };

            if let Some(annots_arr) = annots_list {
                for annot_ref in annots_arr {
                    let annot_obj_result = match *annot_ref {
                        Object::Reference(id) => doc.get_object(id),
                        _ => Ok(annot_ref)
                    };

                    if let Ok(annot_obj) = annot_obj_result {
                        if let Ok(annot_dict) = annot_obj.as_dict() {
                            if let (Ok(subtype), Ok(contents), Ok(rect)) = (
                                annot_dict.get(b"Subtype"),
                                annot_dict.get(b"Contents"),
                                annot_dict.get(b"Rect")
                            ) {
                                if subtype.as_name().unwrap_or(&[]) == b"FreeText" {
                                    let content_bytes = contents.as_str().unwrap_or(b"");
                                    let text = String::from_utf8_lossy(content_bytes).to_string();

                                    let mut font_size = None;
                                    if let Ok(da_obj) = annot_dict.get(b"DA") {
                                        let da_str = String::from_utf8_lossy(da_obj.as_str().unwrap_or(b""));
                                        font_size = parse_font_size_from_da(&da_str);
                                    }

                                    if let Ok(rect_arr) = rect.as_array() {
                                        let x_pdf = get_f64(&rect_arr[0]);
                                        let y_pdf_top = get_f64(&rect_arr[3]);
                                        let y_web = page_height - y_pdf_top;

                                        annotations.push(AnnotationData {
                                            page: page_num,
                                            x: x_pdf,      
                                            y: y_web,      
                                            content: text,
                                            font_size: font_size
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(annotations)
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
async fn get_pdf_page_data(
    handle: tauri::AppHandle,
    path: String,
    page_number: u32,
    width: u32,
) -> Result<String, String> {
    let pdfium = get_pdfium(&handle)?;

    let doc = pdfium
        .load_pdf_from_file(&path, None)
        .map_err(|e| format!("Load error: {:?}", e))?;

    let page = doc
        .pages()
        .get((page_number - 1) as u16)
        .map_err(|e| format!("Page error: {:?}", e))?;

    // 幅を基準にスケール計算（高さ自動）
    let scale = width as f32 / page.width().value;
    let height = (page.height().value * scale) as u32;

    let bitmap = page
        .render_with_config(
            &PdfRenderConfig::new()
                .set_target_width(width as i32)
                .set_target_height(height as i32)
                .render_form_data(true)
        )
        .map_err(|e| format!("Render error: {:?}", e))?;

    let image = bitmap.as_image().into_rgb8();

    // PNGエンコード
    let mut png_bytes: Vec<u8> = Vec::new();
    image::DynamicImage::ImageRgb8(image)
        .write_to(
            &mut std::io::Cursor::new(&mut png_bytes),
            image::ImageFormat::Png,
        )
        .map_err(|e| e.to_string())?;

    Ok(general_purpose::STANDARD.encode(png_bytes))
}


#[tauri::command]
fn open_pdf_file(path: String) -> Result<String, String> {
    // 1. ファイルを読み込む
    let buffer = fs::read(&path).map_err(|e| e.to_string())?;

    // 2. Base64エンコード
    use base64::{engine::general_purpose, Engine as _};
    let encoded = general_purpose::STANDARD.encode(&buffer);
    
    Ok(encoded)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let file_path = if args.len() > 1 {
        Some(args[1].clone())
    } else {
        None
    };

    tauri::Builder::default()
        .manage(StartupFile(Mutex::new(file_path)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init()) 
        .invoke_handler(tauri::generate_handler![
            open_pdf_file, 
            load_annotations, 
            save_pdf_with_annotations,
            get_startup_file,
            get_pdf_page_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}