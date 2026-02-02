# PDF LaTeX Viewer 📄✨

**PDF LaTeX Viewer** is a desktop application built with Tauri that allows you to add **LaTeX-formatted mathematical equations** as annotations to PDF files.

## Installation

### Linux

```bash
wget https://github.com/dragoemon2/pdf-latex-viewer/releases/download/v0.1.0/pdf-latex-viewer_0.1.0_amd64.deb
sudo apt install ./pdf-latex-viewer_0.1.0_amd64.deb
```

## Features

* **LaTeX Annotations**: Write mathematical equations such as `\int`, `\sum`, and `\frac` anywhere on the PDF (powered by KaTeX).
* **Sidebar Features**:
    * Thumbnail list (Virtualization supported)
    * Table of Contents (Outline) navigation
    * Annotation list
    * Full-text search (Ctrl + F)
* **Native Saving**: Annotations are embedded as standard PDF `FreeText Annotations`, so they can be viewed in Adobe Acrobat and other viewers. *Note: External viewers will display the annotation, but cannot render the LaTeX math visually.*
* **Intuitive Operation**: Drag to move, double-click to edit, and keyboard shortcut support.

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl` + `O` | Open file |
| `Ctrl` + `S` | Save |
| `Ctrl` + `Shift` + `S` | Save As |
| `Ctrl` + `F` | Open search tab / Focus |
| `Ctrl` + `+` | Zoom in (Increase font size if selected) |
| `Ctrl` + `-` | Zoom out (Decrease font size if selected) |
| `Delete` / `Backspace` | Delete selected annotation |
| `Double Click` | Edit annotation mode |

## Tech Stack

* **Frontend**: React, TypeScript, Vite
* **Backend**: Tauri (Rust)
* **PDF Core**: `react-pdf` (PDF.js), `lopdf` (Rust)
* **Math Rendering**: KaTeX
* **Performance**: `react-virtuoso` (List Virtualization)