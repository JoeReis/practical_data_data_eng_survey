// ===== DuckDB-WASM Survey Explorer =====
// Main application entry point

import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

let db = null;
let conn = null;
let editor = null;

// Chart filters - applied by clicking on chart bars
// Structure: { column: value, ... }
const chartFilters = {};

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
        initializeDownload();
        initializeMobileMenu();
        
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
    'chart-bottleneck': { column: 'biggest_bottleneck', limit: 8 }
};

async function updateCharts() {
    const whereClause = getWhereClause();
    
    for (const [chartId, config] of Object.entries(chartConfig)) {
        await renderBarChart(chartId, config.column, whereClause, config.limit);
    }
}

async function renderBarChart(chartId, column, whereClause, limit) {
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
            const percentage = (Number(row.count) / maxCount) * 100;
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const label = truncateText(row.label, 28);
            const isActive = activeFilterValue === row.label;
            const activeClass = isActive ? 'active' : '';
            
            // Encode the value for use in data attribute
            const encodedValue = encodeURIComponent(row.label);
            
            html += `
                <div class="chart-bar-row chart-bar-clickable ${activeClass}" 
                     data-column="${column}" 
                     data-value="${encodedValue}"
                     title="Click to filter by ${escapeHtml(row.label)}">
                    <span class="chart-bar-label">${escapeHtml(label)}</span>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width: ${percentage}%; background: ${color};"></div>
                    </div>
                    <span class="chart-bar-value">${Number(row.count).toLocaleString()}</span>
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
        
        showQueryResults({ columns, rows });
        
    } catch (error) {
        document.getElementById('query-time').textContent = '';
        showQueryResults({ error: error.message });
    }
}

function showQueryResults({ columns, rows, error }) {
    const container = document.getElementById('sql-results');
    
    if (error) {
        container.innerHTML = `<p class="error-text">${escapeHtml(error)}</p>`;
        return;
    }
    
    if (rows.length === 0) {
        container.innerHTML = '<p class="placeholder-text">Query returned no results</p>';
        return;
    }
    
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

