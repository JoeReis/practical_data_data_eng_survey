// ===== DuckDB-WASM Survey Explorer =====
// Main application entry point

import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

let db = null;
let conn = null;
let editor = null;
let lastSqlResults = null; // Store last query results for export

// Chart filters - applied by clicking on chart bars
// Structure: { column: value, ... }
const chartFilters = {};

// Chart display mode: 'count' or 'percent'
let chartMetric = 'count';

// Chart colors from CSS variables
const CHART_COLORS = [
    '#58a6ff', '#3fb950', '#d29922', '#f85149', 
    '#a371f7', '#db61a2', '#79c0ff', '#7ee787'
];

// ===== Initialization =====
async function init() {
    try {
        console.log('Initializing DuckDB-WASM...');
        
        // Initialize DuckDB using the jsdelivr CDN bundles
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        
        // Select the best bundle for this browser
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        
        // Create worker URL
        const worker_url = URL.createObjectURL(
            new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
        );
        
        const worker = new Worker(worker_url);
        const logger = new duckdb.ConsoleLogger();
        db = new duckdb.AsyncDuckDB(logger, worker);
        
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(worker_url);
        
        conn = await db.connect();
        console.log('DuckDB connection established');
        
        // Load the Parquet file
        await loadData();
        
        // Initialize the UI
        await initializeFilters();
        await updateCharts();
        initializeTabs();
        initializeSqlEditor();
        initializeCrosstab();
        initializeResponses();
        initializeDownload();
        initializeMobileMenu();
        initializeAboutModal();
        
        // Hide loading overlay
        document.getElementById('loading-overlay').classList.add('hidden');
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        document.querySelector('.loading-content p').textContent = 
            `Error: ${error.message}. Please refresh the page.`;
    }
}

// ===== Data Loading =====
async function loadData() {
    console.log('Loading survey data...');
    
    // Register the parquet file
    const response = await fetch('data/survey.parquet');
    const buffer = await response.arrayBuffer();
    
    await db.registerFileBuffer('survey.parquet', new Uint8Array(buffer));
    
    // Create a view from the parquet file
    await conn.query(`
        CREATE VIEW survey AS 
        SELECT * FROM read_parquet('survey.parquet')
    `);
    
    // Get total count
    const result = await conn.query('SELECT COUNT(*) as count FROM survey');
    const count = result.toArray()[0].count;
    
    document.getElementById('response-count').textContent = count.toLocaleString();
    document.getElementById('total-count').textContent = count.toLocaleString();
    document.getElementById('filtered-count').textContent = count.toLocaleString();
    
    console.log(`Loaded ${count} survey responses`);
}

// ===== Filter Management =====
const filterConfig = {
    'filter-role': 'role',
    'filter-org-size': 'org_size',
    'filter-industry': 'industry',
    'filter-region': 'region',
    'filter-ai-usage': 'ai_usage_frequency'
};

async function initializeFilters() {
    for (const [selectId, column] of Object.entries(filterConfig)) {
        const select = document.getElementById(selectId);
        
        // Get distinct values
        const result = await conn.query(`
            SELECT DISTINCT ${column} as value, COUNT(*) as count 
            FROM survey 
            WHERE ${column} IS NOT NULL 
            GROUP BY ${column} 
            ORDER BY count DESC
        `);
        
        const rows = result.toArray();
        
        // Populate dropdown
        for (const row of rows) {
            const option = document.createElement('option');
            option.value = row.value;
            option.textContent = `${row.value} (${row.count})`;
            select.appendChild(option);
        }
        
        // Add change listener
        select.addEventListener('change', onFilterChange);
    }
    
    // Reset button
    document.getElementById('reset-filters').addEventListener('click', resetFilters);
}

function getWhereClause() {
    const conditions = [];
    
    // Sidebar filters
    for (const [selectId, column] of Object.entries(filterConfig)) {
        const value = document.getElementById(selectId).value;
        if (value) {
            // Escape single quotes in the value
            const escapedValue = value.replace(/'/g, "''");
            conditions.push(`${column} = '${escapedValue}'`);
        }
    }
    
    // Chart filters (from clicking on bars)
    for (const [column, value] of Object.entries(chartFilters)) {
        const escapedValue = value.replace(/'/g, "''");
        conditions.push(`${column} = '${escapedValue}'`);
    }
    
    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

// ===== Chart Filter Management =====
function addChartFilter(column, value) {
    // Toggle: if clicking same filter, remove it
    if (chartFilters[column] === value) {
        delete chartFilters[column];
    } else {
        chartFilters[column] = value;
    }
    
    renderFilterPills();
    onFilterChange();
}

function removeChartFilter(column) {
    delete chartFilters[column];
    renderFilterPills();
    onFilterChange();
}

function clearAllChartFilters() {
    for (const key of Object.keys(chartFilters)) {
        delete chartFilters[key];
    }
    renderFilterPills();
    onFilterChange();
}

function renderFilterPills() {
    const container = document.getElementById('chart-filter-pills');
    if (!container) return;
    
    const entries = Object.entries(chartFilters);
    
    if (entries.length === 0) {
        container.innerHTML = '';
        container.classList.remove('visible');
        return;
    }
    
    // Map column names to friendly labels
    const columnLabels = {
        'role': 'Role',
        'org_size': 'Org Size',
        'industry': 'Industry',
        'region': 'Region',
        'ai_usage_frequency': 'AI Usage',
        'storage_environment': 'Storage',
        'architecture_trend': 'Architecture',
        'team_growth_2026': 'Team Growth',
        'biggest_bottleneck': 'Bottleneck'
    };
    
    let html = entries.map(([column, value]) => {
        const label = columnLabels[column] || column;
        const displayValue = truncateText(value, 20);
        return `
            <button class="filter-pill" data-column="${column}" title="${escapeHtml(value)}">
                <span class="pill-label">${escapeHtml(label)}:</span>
                <span class="pill-value">${escapeHtml(displayValue)}</span>
                <svg class="pill-remove" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
            </button>
        `;
    }).join('');
    
    // Add "Clear all" button if multiple filters
    if (entries.length > 1) {
        html += `<button class="filter-pill filter-pill-clear" id="clear-chart-filters">Clear all</button>`;
    }
    
    container.innerHTML = html;
    container.classList.add('visible');
    
    // Attach event listeners
    container.querySelectorAll('.filter-pill[data-column]').forEach(pill => {
        pill.addEventListener('click', () => {
            removeChartFilter(pill.dataset.column);
        });
    });
    
    const clearBtn = document.getElementById('clear-chart-filters');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllChartFilters);
    }
}

async function onFilterChange() {
    await updateFilteredCount();
    await updateCharts();
    await updateCrosstab();
    responsesPage = 0; // Reset to first page when filters change
    await updateResponses();
}

async function updateFilteredCount() {
    const whereClause = getWhereClause();
    const result = await conn.query(`SELECT COUNT(*) as count FROM survey ${whereClause}`);
    const count = result.toArray()[0].count;
    document.getElementById('filtered-count').textContent = count.toLocaleString();
}

function resetFilters() {
    // Clear sidebar filters
    for (const selectId of Object.keys(filterConfig)) {
        document.getElementById(selectId).value = '';
    }
    // Clear chart filters
    clearAllChartFilters();
}

// ===== Chart Rendering =====
const chartConfig = {
    'chart-role': { column: 'role', limit: 8 },
    'chart-org-size': { column: 'org_size', limit: 8 },
    'chart-industry': { column: 'industry', limit: 8 },
    'chart-ai-usage': { column: 'ai_usage_frequency', limit: 8 },
    'chart-storage': { column: 'storage_environment', limit: 8 },
    'chart-architecture': { column: 'architecture_trend', limit: 8 },
    'chart-growth': { column: 'team_growth_2026', limit: 8 },
    'chart-bottleneck': { column: 'biggest_bottleneck', limit: 8 },
    'chart-region': { column: 'region', limit: 8 },
    'chart-modeling': { column: 'modeling_approach', limit: 8 },
    'chart-modeling-pain': { column: 'modeling_pain_points', limit: 10 }
};

async function updateCharts() {
    const whereClause = getWhereClause();
    
    // Get total filtered count for percentage calculations
    const totalResult = await conn.query(`SELECT COUNT(*) as count FROM survey ${whereClause}`);
    const totalFiltered = Number(totalResult.toArray()[0].count);
    
    for (const [chartId, config] of Object.entries(chartConfig)) {
        await renderBarChart(chartId, config.column, whereClause, config.limit, totalFiltered);
    }
}

async function renderBarChart(chartId, column, whereClause, limit, totalFiltered) {
    const container = document.getElementById(chartId);
    
    try {
        const query = `
            SELECT ${column} as label, COUNT(*) as count 
            FROM survey 
            ${whereClause}
            ${whereClause ? 'AND' : 'WHERE'} ${column} IS NOT NULL
            GROUP BY ${column} 
            ORDER BY count DESC 
            LIMIT ${limit}
        `;
        
        const result = await conn.query(query);
        const rows = result.toArray();
        
        if (rows.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No data for current filters</p>';
            return;
        }
        
        const maxCount = Math.max(...rows.map(r => Number(r.count)));
        
        // Check if this column has an active chart filter
        const activeFilterValue = chartFilters[column];
        
        let html = '<div class="chart-bar-container">';
        
        rows.forEach((row, i) => {
            const count = Number(row.count);
            const barWidth = (count / maxCount) * 100;
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const label = truncateText(row.label, 28);
            const isActive = activeFilterValue === row.label;
            const activeClass = isActive ? 'active' : '';
            
            // Display value based on metric mode
            let displayValue;
            if (chartMetric === 'percent') {
                const pct = totalFiltered > 0 ? (count / totalFiltered) * 100 : 0;
                displayValue = `${pct.toFixed(1)}%`;
            } else {
                displayValue = count.toLocaleString();
            }
            
            // Encode the value for use in data attribute
            const encodedValue = encodeURIComponent(row.label);
            
            html += `
                <div class="chart-bar-row chart-bar-clickable ${activeClass}" 
                     data-column="${column}" 
                     data-value="${encodedValue}"
                     title="Click to filter by ${escapeHtml(row.label)}">
                    <span class="chart-bar-label">${escapeHtml(label)}</span>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width: ${barWidth}%; background: ${color};"></div>
                    </div>
                    <span class="chart-bar-value">${displayValue}</span>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Attach click handlers to bars
        container.querySelectorAll('.chart-bar-clickable').forEach(bar => {
            bar.addEventListener('click', () => {
                const col = bar.dataset.column;
                const value = decodeURIComponent(bar.dataset.value);
                addChartFilter(col, value);
            });
        });
        
    } catch (error) {
        console.error(`Error rendering chart ${chartId}:`, error);
        container.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
    }
}

// ===== Tab Navigation =====
function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update tab states
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update content visibility
            const targetId = `${tab.dataset.tab}-tab`;
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
        });
    });
    
    // Chart metric toggle (count vs percent)
    const metricBtns = document.querySelectorAll('.metric-btn');
    metricBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            metricBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chartMetric = btn.dataset.metric;
            updateCharts();
        });
    });
}

// ===== SQL Editor =====
function initializeSqlEditor() {
    const textarea = document.getElementById('sql-editor');
    
    // Initialize CodeMirror
    editor = CodeMirror.fromTextArea(textarea, {
        mode: 'text/x-sql',
        theme: 'dracula',
        lineNumbers: true,
        autofocus: false,
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: true
    });
    
    // Run query button
    document.getElementById('run-query').addEventListener('click', runQuery);
    
    // Ctrl+Enter to run
    editor.setOption('extraKeys', {
        'Ctrl-Enter': runQuery,
        'Cmd-Enter': runQuery
    });
    
    // Example queries
    document.querySelectorAll('.example-query').forEach(btn => {
        btn.addEventListener('click', () => {
            editor.setValue(btn.dataset.query);
            runQuery();
        });
    });
    
    // Export SQL results
    document.getElementById('export-sql-results').addEventListener('click', exportSqlResults);
}

function exportSqlResults() {
    if (!lastSqlResults || !lastSqlResults.rows.length) {
        return;
    }
    
    const { columns, rows } = lastSqlResults;
    
    // Build CSV content
    let csv = columns.join(',') + '\n';
    
    for (const row of rows) {
        const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            const str = String(val);
            // Escape quotes and wrap in quotes if contains comma, newline, or quote
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        });
        csv += values.join(',') + '\n';
    }
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sql_results_${rows.length}_rows.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

async function runQuery() {
    const sql = editor.getValue().trim();
    
    if (!sql) {
        showQueryResults({ error: 'Please enter a SQL query' });
        return;
    }
    
    const startTime = performance.now();
    
    try {
        const result = await conn.query(sql);
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(1);
        
        document.getElementById('query-time').textContent = `${duration}ms`;
        
        const rows = result.toArray();
        const columns = result.schema.fields.map(f => f.name);
        
        // Store results for export
        lastSqlResults = { columns, rows };
        
        showQueryResults({ columns, rows });
        
    } catch (error) {
        document.getElementById('query-time').textContent = '';
        lastSqlResults = null;
        showQueryResults({ error: error.message });
    }
}

function showQueryResults({ columns, rows, error }) {
    const container = document.getElementById('sql-results');
    const exportBtn = document.getElementById('export-sql-results');
    
    if (error) {
        container.innerHTML = `<p class="error-text">${escapeHtml(error)}</p>`;
        exportBtn.disabled = true;
        return;
    }
    
    if (rows.length === 0) {
        container.innerHTML = '<p class="placeholder-text">Query returned no results</p>';
        exportBtn.disabled = true;
        return;
    }
    
    // Enable export button
    exportBtn.disabled = false;
    
    let html = `
        <table class="results-table">
            <thead>
                <tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
            </thead>
            <tbody>
    `;
    
    // Limit to 1000 rows for performance
    const displayRows = rows.slice(0, 1000);
    
    for (const row of displayRows) {
        html += '<tr>';
        for (const col of columns) {
            const value = row[col];
            const displayValue = value === null ? '<em>null</em>' : escapeHtml(String(value));
            html += `<td title="${escapeHtml(String(value))}">${displayValue}</td>`;
        }
        html += '</tr>';
    }
    
    html += '</tbody></table>';
    
    if (rows.length > 1000) {
        html += `<p class="placeholder-text" style="margin-top: 16px;">Showing 1,000 of ${rows.length.toLocaleString()} rows</p>`;
    }
    
    container.innerHTML = html;
}

// ===== CSV Download =====
function initializeDownload() {
    document.getElementById('download-csv').addEventListener('click', () => {
        // Direct link to CSV file
        const link = document.createElement('a');
        link.href = 'data/survey.csv';
        link.download = 'survey_2026_data_engineering.csv';
        link.click();
    });
}

// ===== About Modal =====
function initializeAboutModal() {
    const modal = document.getElementById('about-modal');
    const openBtn = document.getElementById('about-btn');
    const closeBtn = document.getElementById('close-modal');
    
    function openModal() {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    }
    
    function closeModal() {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
    
    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeModal();
        }
    });
}

// ===== Mobile Menu =====
function initializeMobileMenu() {
    const toggle = document.getElementById('mobile-menu-toggle');
    const closeBtn = document.getElementById('close-filters');
    const filterPanel = document.querySelector('.filter-panel');
    
    toggle.addEventListener('click', () => {
        const isOpen = filterPanel.classList.contains('open');
        
        if (isOpen) {
            closeMobileMenu();
        } else {
            filterPanel.classList.add('open');
            
            // Add backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'filter-backdrop';
            backdrop.addEventListener('click', closeMobileMenu);
            document.body.appendChild(backdrop);
        }
    });
    
    closeBtn.addEventListener('click', closeMobileMenu);
}

function closeMobileMenu() {
    const filterPanel = document.querySelector('.filter-panel');
    const backdrop = document.querySelector('.filter-backdrop');
    
    filterPanel.classList.remove('open');
    if (backdrop) {
        backdrop.remove();
    }
}

// ===== Crosstab =====
function initializeCrosstab() {
    const rowSelect = document.getElementById('crosstab-rows');
    const colSelect = document.getElementById('crosstab-cols');
    const metricSelect = document.getElementById('crosstab-metric');
    const swapBtn = document.getElementById('crosstab-swap');
    const wrapToggle = document.getElementById('crosstab-wrap-text');
    
    // Update on selection change
    rowSelect.addEventListener('change', updateCrosstab);
    colSelect.addEventListener('change', updateCrosstab);
    metricSelect.addEventListener('change', updateCrosstab);
    wrapToggle.addEventListener('change', updateCrosstab);
    
    // Swap button
    swapBtn.addEventListener('click', () => {
        const rowVal = rowSelect.value;
        const colVal = colSelect.value;
        rowSelect.value = colVal;
        colSelect.value = rowVal;
        updateCrosstab();
    });
    
    // Initial render
    updateCrosstab();
}

// Multi-select columns that need to be split
const MULTI_SELECT_COLUMNS = ['modeling_pain_points', 'team_focus', 'ai_helps_with'];

function isMultiSelect(column) {
    return MULTI_SELECT_COLUMNS.includes(column);
}

async function updateCrosstab() {
    const rowCol = document.getElementById('crosstab-rows').value;
    const colCol = document.getElementById('crosstab-cols').value;
    const metric = document.getElementById('crosstab-metric').value;
    const container = document.getElementById('crosstab-results');
    
    if (rowCol === colCol) {
        container.innerHTML = '<p class="placeholder-text">Please select different dimensions for rows and columns</p>';
        return;
    }
    
    try {
        const whereClause = getWhereClause();
        
        // Build query based on whether columns are multi-select
        const rowIsMulti = isMultiSelect(rowCol);
        const colIsMulti = isMultiSelect(colCol);
        
        let query;
        if (rowIsMulti && colIsMulti) {
            // Both are multi-select
            query = `
                SELECT 
                    trim(row_item.value) as row_val,
                    trim(col_item.value) as col_val,
                    COUNT(*) as count
                FROM survey,
                    unnest(string_split(${rowCol}, ',')) as row_item(value),
                    unnest(string_split(${colCol}, ',')) as col_item(value)
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${rowCol} IS NOT NULL AND ${colCol} IS NOT NULL
                GROUP BY trim(row_item.value), trim(col_item.value)
                ORDER BY row_val, col_val
            `;
        } else if (rowIsMulti) {
            // Only row is multi-select
            query = `
                SELECT 
                    trim(row_item.value) as row_val,
                    ${colCol} as col_val,
                    COUNT(*) as count
                FROM survey,
                    unnest(string_split(${rowCol}, ',')) as row_item(value)
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${rowCol} IS NOT NULL AND ${colCol} IS NOT NULL
                GROUP BY trim(row_item.value), ${colCol}
                ORDER BY row_val, col_val
            `;
        } else if (colIsMulti) {
            // Only column is multi-select
            query = `
                SELECT 
                    ${rowCol} as row_val,
                    trim(col_item.value) as col_val,
                    COUNT(*) as count
                FROM survey,
                    unnest(string_split(${colCol}, ',')) as col_item(value)
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${rowCol} IS NOT NULL AND ${colCol} IS NOT NULL
                GROUP BY ${rowCol}, trim(col_item.value)
                ORDER BY row_val, col_val
            `;
        } else {
            // Neither is multi-select (original query)
            query = `
                SELECT 
                    ${rowCol} as row_val,
                    ${colCol} as col_val,
                    COUNT(*) as count
                FROM survey
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${rowCol} IS NOT NULL AND ${colCol} IS NOT NULL
                GROUP BY ${rowCol}, ${colCol}
                ORDER BY ${rowCol}, ${colCol}
            `;
        }
        
        const result = await conn.query(query);
        const data = result.toArray();
        
        if (data.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No data for current filters</p>';
            return;
        }
        
        // Get unique row and column values with their totals
        let rowTotalsQuery, colTotalsQuery;
        
        if (rowIsMulti) {
            rowTotalsQuery = `
                SELECT trim(item.value) as val, COUNT(*) as total
                FROM survey, unnest(string_split(${rowCol}, ',')) as item(value)
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${rowCol} IS NOT NULL
                GROUP BY trim(item.value)
                ORDER BY total DESC
            `;
        } else {
            rowTotalsQuery = `
                SELECT ${rowCol} as val, COUNT(*) as total
                FROM survey
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${rowCol} IS NOT NULL
                GROUP BY ${rowCol}
                ORDER BY total DESC
            `;
        }
        
        if (colIsMulti) {
            colTotalsQuery = `
                SELECT trim(item.value) as val, COUNT(*) as total
                FROM survey, unnest(string_split(${colCol}, ',')) as item(value)
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${colCol} IS NOT NULL
                GROUP BY trim(item.value)
                ORDER BY total DESC
            `;
        } else {
            colTotalsQuery = `
                SELECT ${colCol} as val, COUNT(*) as total
                FROM survey
                ${whereClause}
                ${whereClause ? 'AND' : 'WHERE'} ${colCol} IS NOT NULL
                GROUP BY ${colCol}
                ORDER BY total DESC
            `;
        }
        
        const [rowTotalsResult, colTotalsResult] = await Promise.all([
            conn.query(rowTotalsQuery),
            conn.query(colTotalsQuery)
        ]);
        
        const rowTotals = new Map(rowTotalsResult.toArray().map(r => [r.val, Number(r.total)]));
        const colTotals = new Map(colTotalsResult.toArray().map(r => [r.val, Number(r.total)]));
        
        const rows = Array.from(rowTotals.keys());
        const cols = Array.from(colTotals.keys());
        
        // Build the matrix
        const matrix = new Map();
        for (const d of data) {
            const key = `${d.row_val}|||${d.col_val}`;
            matrix.set(key, Number(d.count));
        }
        
        // Calculate grand total
        const grandTotal = Array.from(rowTotals.values()).reduce((a, b) => a + b, 0);
        
        // Find max value for heatmap scaling
        let maxValue = 0;
        for (const row of rows) {
            for (const col of cols) {
                const count = matrix.get(`${row}|||${col}`) || 0;
                let value;
                if (metric === 'row_pct') {
                    value = rowTotals.get(row) > 0 ? (count / rowTotals.get(row)) * 100 : 0;
                } else if (metric === 'col_pct') {
                    value = colTotals.get(col) > 0 ? (count / colTotals.get(col)) * 100 : 0;
                } else {
                    value = count;
                }
                maxValue = Math.max(maxValue, value);
            }
        }
        
        // Build the table HTML
        const columnLabels = getColumnLabel();
        const wrapText = document.getElementById('crosstab-wrap-text').checked;
        const wrapClass = wrapText ? ' wrap-text' : '';
        
        let html = `<table class="crosstab-table${wrapClass}">`;
        
        // Header row
        html += '<thead><tr>';
        html += `<th class="crosstab-corner">${columnLabels[rowCol]} / ${columnLabels[colCol]}</th>`;
        for (const col of cols) {
            const displayCol = wrapText ? col : truncateText(col, 15);
            html += `<th class="crosstab-col-header" title="${escapeHtml(col)}">${escapeHtml(displayCol)}</th>`;
        }
        html += '<th class="crosstab-total-header">Total</th>';
        html += '</tr></thead>';
        
        // Data rows
        html += '<tbody>';
        for (const row of rows) {
            html += '<tr>';
            const displayRow = wrapText ? row : truncateText(row, 25);
            html += `<th class="crosstab-row-header" title="${escapeHtml(row)}">${escapeHtml(displayRow)}</th>`;
            
            for (const col of cols) {
                const count = matrix.get(`${row}|||${col}`) || 0;
                let displayValue;
                let intensity;
                
                if (metric === 'row_pct') {
                    const pct = rowTotals.get(row) > 0 ? (count / rowTotals.get(row)) * 100 : 0;
                    displayValue = pct > 0 ? `${pct.toFixed(1)}%` : '–';
                    intensity = maxValue > 0 ? pct / maxValue : 0;
                } else if (metric === 'col_pct') {
                    const pct = colTotals.get(col) > 0 ? (count / colTotals.get(col)) * 100 : 0;
                    displayValue = pct > 0 ? `${pct.toFixed(1)}%` : '–';
                    intensity = maxValue > 0 ? pct / maxValue : 0;
                } else {
                    displayValue = count > 0 ? count.toLocaleString() : '–';
                    intensity = maxValue > 0 ? count / maxValue : 0;
                }
                
                const bgColor = getHeatmapColor(intensity);
                const textColor = intensity > 0.5 ? '#ffffff' : 'var(--color-text-primary)';
                
                html += `<td class="crosstab-cell" style="background: ${bgColor}; color: ${textColor};" title="${count} responses">${displayValue}</td>`;
            }
            
            // Row total
            const rowTotal = rowTotals.get(row);
            html += `<td class="crosstab-row-total">${rowTotal.toLocaleString()}</td>`;
            html += '</tr>';
        }
        
        // Column totals row
        html += '<tr class="crosstab-totals-row">';
        html += '<th class="crosstab-row-header">Total</th>';
        for (const col of cols) {
            html += `<td class="crosstab-col-total">${colTotals.get(col).toLocaleString()}</td>`;
        }
        html += `<td class="crosstab-grand-total">${grandTotal.toLocaleString()}</td>`;
        html += '</tr>';
        
        html += '</tbody></table>';
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Crosstab error:', error);
        container.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
    }
}

function getColumnLabel() {
    return {
        'role': 'Role',
        'org_size': 'Org Size',
        'industry': 'Industry',
        'region': 'Region',
        'ai_usage_frequency': 'AI Usage',
        'ai_adoption': 'AI Adoption',
        'storage_environment': 'Storage',
        'orchestration': 'Orchestration',
        'modeling_approach': 'Modeling',
        'modeling_pain_points': 'Pain Points',
        'architecture_trend': 'Architecture',
        'team_growth_2026': 'Team Growth',
        'biggest_bottleneck': 'Bottleneck',
        'team_focus': 'Team Focus',
        'ai_helps_with': 'AI Helps With',
        'education_topic': 'Education Topic'
    };
}

function getHeatmapColor(intensity) {
    if (intensity === 0) return 'transparent';
    
    // Blue heatmap: from light to dark blue
    const minAlpha = 0.15;
    const maxAlpha = 0.85;
    const alpha = minAlpha + (intensity * (maxAlpha - minAlpha));
    
    return `rgba(88, 166, 255, ${alpha})`;
}

// ===== Responses Viewer =====
let responsesPage = 0;
const responsesPerPage = 25;
let responsesTotalCount = 0;

function initializeResponses() {
    // Pagination buttons
    document.getElementById('responses-prev').addEventListener('click', () => {
        if (responsesPage > 0) {
            responsesPage--;
            updateResponses();
        }
    });
    
    document.getElementById('responses-next').addEventListener('click', () => {
        if ((responsesPage + 1) * responsesPerPage < responsesTotalCount) {
            responsesPage++;
            updateResponses();
        }
    });
    
    // Toggle for text fields
    document.getElementById('show-text-fields').addEventListener('change', updateResponses);
    
    // Export filtered CSV
    document.getElementById('export-filtered-csv').addEventListener('click', exportFilteredCsv);
    
    // Initial load
    updateResponses();
}

async function updateResponses() {
    const container = document.getElementById('responses-results');
    const showTextFields = document.getElementById('show-text-fields').checked;
    
    try {
        const whereClause = getWhereClause();
        
        // Get total count
        const countResult = await conn.query(`SELECT COUNT(*) as count FROM survey ${whereClause}`);
        responsesTotalCount = Number(countResult.toArray()[0].count);
        
        // Reset to first page if filters changed and we're beyond available data
        if (responsesPage * responsesPerPage >= responsesTotalCount) {
            responsesPage = 0;
        }
        
        // Define columns to show
        const baseColumns = ['role', 'org_size', 'industry', 'region', 'ai_usage_frequency'];
        const textColumns = ['education_topic', 'industry_wish'];
        const columns = showTextFields ? [...baseColumns, ...textColumns] : baseColumns;
        
        // Get paginated data
        const query = `
            SELECT ${columns.join(', ')}
            FROM survey
            ${whereClause}
            ORDER BY timestamp DESC
            LIMIT ${responsesPerPage}
            OFFSET ${responsesPage * responsesPerPage}
        `;
        
        const result = await conn.query(query);
        const rows = result.toArray();
        
        // Update counts
        const startNum = responsesPage * responsesPerPage + 1;
        const endNum = Math.min((responsesPage + 1) * responsesPerPage, responsesTotalCount);
        document.getElementById('responses-showing').textContent = rows.length > 0 ? `${startNum}-${endNum}` : '0';
        document.getElementById('responses-total').textContent = responsesTotalCount.toLocaleString();
        
        // Update pagination
        const totalPages = Math.ceil(responsesTotalCount / responsesPerPage);
        document.getElementById('responses-page-info').textContent = `Page ${responsesPage + 1} of ${totalPages}`;
        document.getElementById('responses-prev').disabled = responsesPage === 0;
        document.getElementById('responses-next').disabled = (responsesPage + 1) * responsesPerPage >= responsesTotalCount;
        
        if (rows.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No responses match current filters</p>';
            return;
        }
        
        // Column labels
        const columnLabels = {
            'role': 'Role',
            'org_size': 'Org Size',
            'industry': 'Industry',
            'region': 'Region',
            'ai_usage_frequency': 'AI Usage',
            'education_topic': 'Education Topic',
            'industry_wish': 'Industry Wish'
        };
        
        // Build table
        let html = '<table class="responses-table">';
        html += '<thead><tr>';
        html += '<th class="response-row-num">#</th>';
        for (const col of columns) {
            const isTextCol = textColumns.includes(col);
            const className = isTextCol ? 'text-column' : '';
            html += `<th class="${className}">${columnLabels[col] || col}</th>`;
        }
        html += '</tr></thead>';
        
        html += '<tbody>';
        rows.forEach((row, i) => {
            const rowNum = responsesPage * responsesPerPage + i + 1;
            html += '<tr>';
            html += `<td class="response-row-num">${rowNum}</td>`;
            
            for (const col of columns) {
                const value = row[col];
                const isTextCol = textColumns.includes(col);
                
                if (isTextCol) {
                    if (value && value.trim()) {
                        const truncated = truncateText(value, 100);
                        const needsExpand = value.length > 100;
                        html += `
                            <td class="text-column">
                                <div class="text-cell ${needsExpand ? 'expandable' : ''}" ${needsExpand ? 'data-full-text="' + escapeHtml(value).replace(/"/g, '&quot;') + '"' : ''}>
                                    <span class="text-preview">${escapeHtml(truncated)}</span>
                                    ${needsExpand ? '<button class="expand-btn">Show more</button>' : ''}
                                </div>
                            </td>
                        `;
                    } else {
                        html += '<td class="text-column"><span class="empty-text">–</span></td>';
                    }
                } else {
                    html += `<td title="${escapeHtml(value || '')}">${escapeHtml(truncateText(value || '–', 30))}</td>`;
                }
            }
            html += '</tr>';
        });
        html += '</tbody></table>';
        
        container.innerHTML = html;
        
        // Add expand/collapse handlers
        container.querySelectorAll('.expand-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cell = e.target.closest('.text-cell');
                const preview = cell.querySelector('.text-preview');
                const fullText = cell.dataset.fullText;
                
                if (cell.classList.contains('expanded')) {
                    preview.textContent = truncateText(fullText, 100);
                    btn.textContent = 'Show more';
                    cell.classList.remove('expanded');
                } else {
                    preview.textContent = fullText;
                    btn.textContent = 'Show less';
                    cell.classList.add('expanded');
                }
            });
        });
        
    } catch (error) {
        console.error('Responses error:', error);
        container.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
    }
}

async function exportFilteredCsv() {
    try {
        const whereClause = getWhereClause();
        const query = `SELECT * FROM survey ${whereClause} ORDER BY timestamp DESC`;
        const result = await conn.query(query);
        const rows = result.toArray();
        
        if (rows.length === 0) {
            alert('No data to export with current filters');
            return;
        }
        
        // Get column names
        const columns = result.schema.fields.map(f => f.name);
        
        // Build CSV content
        let csv = columns.join(',') + '\n';
        
        for (const row of rows) {
            const values = columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                // Escape quotes and wrap in quotes if contains comma or newline
                const str = String(val);
                if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            });
            csv += values.join(',') + '\n';
        }
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `survey_filtered_${rows.length}_responses.csv`;
        link.click();
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting data: ' + error.message);
    }
}

// ===== Utility Functions =====
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 1) + '…';
}

// ===== Start Application =====
document.addEventListener('DOMContentLoaded', init);

