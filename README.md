# 2026 State of Data Engineering Survey Explorer

An interactive browser-based tool for exploring the results of The Practical Data 2026 State of Data Engineering Survey. Built with DuckDB-WASM, it runs entirely in the browser with no backend required.

## Features

### Charts Dashboard
- 8 interactive bar charts showing response distributions
- **Click any bar to filter** all charts by that value
- Filter pills show active selections with one-click removal

### Crosstab Analysis
- Compare any two dimensions in a matrix view
- Toggle between Row %, Column %, or raw Count
- Heatmap coloring highlights patterns
- Swap rows/columns with one click

### Response Viewer
- Browse individual survey responses with pagination
- Toggle open-ended text fields (Education Topic, Industry Wish)
- Expandable cells for long text responses
- Export filtered subset as CSV

### SQL Query Editor
- Full DuckDB SQL with syntax highlighting
- Example queries to get started
- Export query results as CSV
- Ctrl+Enter to run queries

### Filtering
- Sidebar filters: Role, Org Size, Industry, Region, AI Usage
- Chart click-filters that apply across all views
- All filters work together across tabs

## Quick Start

```bash
# Navigate to the project directory
cd 2026_Survey

# Start a local server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

## Project Structure

```
2026_Survey/
├── index.html          # Main application
├── css/
│   └── styles.css      # Dark theme styling
├── js/
│   └── app.js          # DuckDB-WASM + UI logic
├── data/
│   ├── survey.parquet  # Optimized data (76 KB)
│   └── survey.csv      # Downloadable format (570 KB)
└── README.md
```

## Data Schema

| Column | Description |
|--------|-------------|
| `timestamp` | Response submission time |
| `role` | Primary job role |
| `org_size` | Organization size |
| `industry` | Industry sector |
| `team_focus` | Where team spends most time |
| `storage_environment` | Primary storage/processing environment |
| `orchestration` | Primary orchestration approach |
| `ai_usage_frequency` | How often AI tools are used |
| `ai_helps_with` | What AI helps most with |
| `ai_adoption` | Organization's AI adoption level |
| `modeling_approach` | Team's data modeling approach |
| `modeling_pain_points` | Current modeling challenges |
| `architecture_trend` | Architectural alignment |
| `biggest_bottleneck` | Main organizational bottleneck |
| `team_growth_2026` | Team growth expectations |
| `education_topic` | Desired training topics |
| `industry_wish` | What industry should understand |
| `region` | Geographic region |

## Deployment

This is a static site with no backend. Deploy to any static host:

### GitHub Pages
```bash
# Push to a GitHub repository
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main

# Enable GitHub Pages in repository settings
```

### Netlify / Vercel
Simply drag and drop the project folder, or connect your Git repository.

### Any Web Server
Upload all files maintaining the directory structure. Ensure the server can serve `.parquet` files.

## Technology

- **[DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview)** - Full SQL database in the browser
- **[CodeMirror](https://codemirror.net/)** - SQL syntax highlighting
- **Parquet format** - 7x smaller than CSV, faster queries
- **Vanilla JS** - No framework dependencies

## Browser Compatibility

Works in all modern browsers that support WebAssembly:
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 16+

## License

Data from The Practical Data 2026 State of Data Engineering Survey.

---

Built with DuckDB-WASM • [The Practical Data](https://thepracticaldata.com)
