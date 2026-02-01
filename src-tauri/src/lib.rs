use std::collections::HashMap;
use lopdf::{Document, Object, Dictionary, StringFormat, ObjectId};
use std::str;
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize}; // 必要なら use を調整

struct StartupFile(Mutex<Option<String>>);

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

// ヘルパー関数: Objectからf64を取り出す（IntegerまたはRealに対応）
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

        // "Annots" キーがあるか確認
        if let Ok(annots_obj) = page_dict.get(b"Annots") {
            
            // Referenceなら実体を取得、Arrayならそのまま使う
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
                            
                            // テキスト注釈(FreeText)かつ、内容があるものを探す
                            if let (Ok(subtype), Ok(contents), Ok(rect)) = (
                                annot_dict.get(b"Subtype"),
                                annot_dict.get(b"Contents"),
                                annot_dict.get(b"Rect")
                            ) {
                                if subtype.as_name().unwrap_or(&[]) == b"FreeText" {
                                    
                                    let content_bytes = contents.as_str().unwrap_or(b"");
                                    let text = String::from_utf8_lossy(content_bytes).to_string();

                                    // ▼▼▼ 追加: フォントサイズの取得 ▼▼▼
                                    let mut font_size = None;
                                    if let Ok(da_obj) = annot_dict.get(b"DA") {
                                        let da_str = String::from_utf8_lossy(da_obj.as_str().unwrap_or(b""));
                                        font_size = parse_font_size_from_da(&da_str);
                                    }
                                    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

                                    if let Ok(rect_arr) = rect.as_array() {
                                        // Rect: [x_left, y_bottom, x_right, y_top]
                                        let x_pdf = get_f64(&rect_arr[0]);
                                        
                                        // ▼▼▼ 修正: Y座標は y_top (インデックス3) を使う ▼▼▼
                                        // 保存時に「ReactのY = 文字の上端」として扱っているため、読み込み時も上端を取る必要がある
                                        let y_pdf_top = get_f64(&rect_arr[3]);
                                        let y_web = page_height - y_pdf_top;
                                        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

                                        annotations.push(AnnotationData {
                                            page: page_num,
                                            x: x_pdf,     
                                            y: y_web,     
                                            content: text,
                                            font_size: font_size // 👈 追加
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

    // 2. 入力されたアノテーションをページ番号ごとにグループ化する (Page 1, Page 2...)
    // React側は1始まり、lopdfも通常1始まりで管理されます
    let mut annots_by_page: HashMap<u32, Vec<AnnotationData>> = HashMap::new();
    for ann in annotations {
        annots_by_page.entry(ann.page as u32).or_default().push(ann);
    }

    // 3. PDFのページ構造を取得
    let pages = doc.get_pages(); // BTreeMap<u32, ObjectId>

    // 4. 各ページを処理
    for (page_num, page_id) in pages {
        // このページに追加すべきアノテーションIDのリスト（新しく作る）
        let mut new_annot_ids = Vec::new();

        // もしこのページに配置すべきアノテーションがあれば作成する
        if let Some(page_annots) = annots_by_page.get(&page_num) {
            
            // ページの高さ（MediaBox）を取得して座標変換する
            // 取得できなければA4(842.0)とする
            let page_height = get_page_height(&doc, page_id).unwrap_or(842.0);

            for ann in page_annots {
                // React-PDF(左上原点) -> PDF(左下原点) への変換
                let pdf_y = page_height - ann.y as f32;

                let font_size = ann.font_size.unwrap_or(14.0);

                // 注釈オブジェクト作成
                let mut annot_dict = Dictionary::new();
                annot_dict.set("Type", Object::Name(b"Annot".to_vec()));
                annot_dict.set("Subtype", Object::Name(b"FreeText".to_vec()));
                
                // 外観設定（文字色など）: 黒色
                let da_str = format!("0 0 0 rg /Helv {} Tf", font_size);
                annot_dict.set("DA", Object::String(da_str.into_bytes(), StringFormat::Literal));
                
                // 文字列
                annot_dict.set("Contents", Object::String(ann.content.clone().into_bytes(), StringFormat::Literal));
                
                // 位置 (x, y_bottom, x_right, y_top)
                // 数式に合わせて適当なボックスサイズを持たせる
                annot_dict.set("Rect", Object::Array(vec![
                    Object::Real(ann.x as f32),
                    Object::Real(pdf_y - (font_size * 1.5)), 
                    Object::Real(ann.x as f32 + 200.0),      
                    Object::Real(pdf_y)
                ]));

                // ドキュメントに追加してIDを取得
                let annot_id = doc.add_object(annot_dict);
                
                // 新しいリストに追加
                new_annot_ids.push(Object::Reference(annot_id));
            }
        }

        // 5. ページの "Annots" を【上書き】する
        // これにより、以前保存されていたアノテーションへの参照が切れ、新しいものだけになる
        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(page_dict) = page_obj.as_dict_mut() {
                if new_annot_ids.is_empty() {
                    // アノテーションがない場合はエントリごと削除するか、空配列にする
                    page_dict.remove(b"Annots");
                } else {
                    // 新しいリストで上書き (重複防止のキモ)
                    page_dict.set("Annots", Object::Array(new_annot_ids));
                }
            }
        }
    }

    // 保存 (使わなくなった古いオブジェクトの掃除(ゴミ箱)まではlopdf標準では難しいが、参照は切れるので表示されなくなる)
    doc.save(path).map_err(|e| e.to_string())?;
    Ok(())
}

// ヘルパー関数: ページのMediaBoxから高さを取得する
fn get_page_height(doc: &Document, page_id: lopdf::ObjectId) -> Option<f32> {
    let page_obj = doc.get_object(page_id).ok()?;
    let page_dict = page_obj.as_dict().ok()?;
    
    // MediaBox: [x1, y1, x2, y2]
    // 親ページ(Pages)から継承される場合もあるが、簡易的に直接取得を試みる
    let media_box = page_dict.get(b"MediaBox").ok().and_then(|o| o.as_array().ok())?;
    
    if media_box.len() >= 4 {
        let y1 = media_box[1].as_f32().ok()?;
        let y2 = media_box[3].as_f32().ok()?;
        Some((y2 - y1).abs())
    } else {
        None
    }
}

// 既存のPDFオープン用コマンド
#[tauri::command]
fn open_pdf_file(path: String) -> Result<String, String> {
    // 1. PDFを読み込む
    let mut doc = Document::load(&path).map_err(|e| e.to_string())?;

    // 2. ページIDのリストを先に作成してコピーする (Borrow Checker対策)
    // get_pages() は BTreeMap<u32, ObjectId> を返すので、値(ObjectId)だけを集めます
    let page_ids: Vec<ObjectId> = doc.get_pages()
        .values()
        .cloned()
        .collect();

    // 3. 集めたIDを使ってアノテーションを削除
    for id in page_ids {
        if let Ok(page_obj) = doc.get_object_mut(id) {
            if let Ok(page_dict) = page_obj.as_dict_mut() {
                // "Annots" エントリを削除
                page_dict.remove(b"Annots");
            }
        }
    }

    // 4. メモリ上に保存 (表示用データの作成)
    let mut buffer = Vec::new();
    doc.save_to(&mut buffer).map_err(|e| e.to_string())?;

    // 5. Base64エンコード
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
        .plugin(tauri_plugin_dialog::init()) // ダイアログプラグイン
        .invoke_handler(tauri::generate_handler![
            open_pdf_file, 
            load_annotations, 
            save_pdf_with_annotations,
            get_startup_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

