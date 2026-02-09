// ===== DuckDB-WASM Survey Explorer =====
// Main application entry point

import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

let db = null;
let conn = null;
let editor = null;
let lastSqlResults = null; // Store last query results for export
let codeMirrorLoaded = false; // Lazy-load tracking
let codeMirrorLoading = false;
let responsesSearchTerm = ''; // Search term for responses tab
let compareMode = false; // Comparison mode state

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

// ===== Loading Progress =====
function updateLoadingProgress(message, percent) {
    const textEl = document.querySelector('.loading-text');
    const barEl = document.querySelector('.loading-progress-bar');
    if (textEl) textEl.textContent = message;
    if (barEl) {
        barEl.style.animation = 'none';
        barEl.style.width = `${percent}%`;
        barEl.style.transform = 'none';
    }
}

// ===== Initialization =====
async function init() {
    try {
        console.log('Initializing DuckDB-WASM...');
        updateLoadingProgress('Initializing DuckDB engine...', 10);
        
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
        updateLoadingProgress('Connecting to database...', 30);
        
        conn = await db.connect();
        console.log('DuckDB connection established');
        updateLoadingProgress('Loading survey data...', 50);
        
        // Load the Parquet file
        await loadData();
        updateLoadingProgress('Initializing filters...', 65);
        
        // Initialize the UI
        await initializeFilters();
        
        // Restore state from URL (after filters are populated)
        restoreStateFromUrl();
        
        // Restore filters from localStorage if no URL params
        restoreFiltersFromLocalStorage();
        
        updateLoadingProgress('Rendering charts...', 80);
        await updateCharts();
        
        updateLoadingProgress('Setting up interface...', 90);
        initializeTabs();
        initializeChartMetricToggle();
        // CodeMirror is now lazy-loaded when SQL tab is first activated
        initializeSqlEditorPlaceholder();
        initializeCrosstab();
        initializeResponses();
        initializeDownload();
        initializeMobileMenu();
        initializeAboutModal();
        initializeShareButton();
        initializeThemeToggle();
        initializeChartExport();
        initializeReportToc();
        initializeScrollToTop();
        initializeKeyboardShortcuts();
        initializeShortcutsModal();
        initializeChartTooltip();
        initializeSqlHistory();
        initializeComparisonMode();
        
        updateLoadingProgress('Ready!', 100);
        
        // Hide loading overlay
        setTimeout(() => {
            document.getElementById('loading-overlay').classList.add('hidden');
        }, 200);
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        document.querySelector('.loading-text').textContent = 
            `Error: ${error.message}. Please refresh the page.`;
    }
}

// ===== URL State Management =====
function restoreStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    
    // Restore sidebar filters
    for (const [selectId, column] of Object.entries(filterConfig)) {
        const value = params.get(column);
        if (value) {
            const select = document.getElementById(selectId);
            // Check if the value exists in options
            const optionExists = Array.from(select.options).some(opt => opt.value === value);
            if (optionExists) {
                select.value = value;
            }
        }
    }
    
    // Restore chart filters
    const chartFilterParam = params.get('cf');
    if (chartFilterParam) {
        try {
            const filters = JSON.parse(decodeURIComponent(chartFilterParam));
            for (const [col, val] of Object.entries(filters)) {
                chartFilters[col] = val;
            }
            renderFilterPills();
        } catch (e) {
            console.warn('Could not parse chart filters from URL:', e);
        }
    }
    
    // Restore tab
    const tab = params.get('tab');
    if (tab) {
        const tabBtn = document.querySelector(`.tab[data-tab="${tab}"]`);
        if (tabBtn) {
            // Will be activated by initializeTabs, but set active class now
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const content = document.getElementById(`${tab}-tab`);
            if (content) content.classList.add('active');
        }
    }
}

function updateUrlState() {
    const params = new URLSearchParams();
    
    // Add sidebar filters
    for (const [selectId, column] of Object.entries(filterConfig)) {
        const value = document.getElementById(selectId).value;
        if (value) {
            params.set(column, value);
        }
    }
    
    // Add chart filters
    if (Object.keys(chartFilters).length > 0) {
        params.set('cf', encodeURIComponent(JSON.stringify(chartFilters)));
    }
    
    // Add active tab (only if not the default 'report' tab)
    const activeTab = document.querySelector('.tab.active');
    if (activeTab && activeTab.dataset.tab !== 'report') {
        params.set('tab', activeTab.dataset.tab);
    }
    
    // Update URL without reload
    const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    
    window.history.replaceState({}, '', newUrl);
}

function getShareableUrl() {
    updateUrlState();
    return window.location.href;
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
    updateUrlState(); // Update shareable URL
    saveFiltersToLocalStorage(); // Persist for return visits
    announceFilterChange(); // Accessibility: announce to screen readers
}

// ===== localStorage Filter Persistence =====
function saveFiltersToLocalStorage() {
    try {
        const state = {};
        for (const [selectId, column] of Object.entries(filterConfig)) {
            const value = document.getElementById(selectId).value;
            if (value) state[selectId] = value;
        }
        if (Object.keys(chartFilters).length > 0) {
            state._chartFilters = { ...chartFilters };
        }
        localStorage.setItem('surveyFilters', JSON.stringify(state));
    } catch (e) {
        // Private browsing or storage full — ignore
    }
}

function restoreFiltersFromLocalStorage() {
    // Only restore if no URL params are present (URL takes priority)
    if (window.location.search) return;
    
    try {
        const saved = localStorage.getItem('surveyFilters');
        if (!saved) return;
        
        const state = JSON.parse(saved);
        let anyRestored = false;
        
        for (const [selectId, column] of Object.entries(filterConfig)) {
            if (state[selectId]) {
                const select = document.getElementById(selectId);
                const optionExists = Array.from(select.options).some(opt => opt.value === state[selectId]);
                if (optionExists) {
                    select.value = state[selectId];
                    anyRestored = true;
                }
            }
        }
        
        if (state._chartFilters) {
            for (const [col, val] of Object.entries(state._chartFilters)) {
                chartFilters[col] = val;
            }
            renderFilterPills();
            anyRestored = true;
        }
        
        if (anyRestored) {
            // Re-apply filters without triggering another save
            updateFilteredCount();
        }
    } catch (e) {
        // Corrupted data — ignore
    }
}

// ===== ARIA Announcements =====
function announce(message) {
    const announcer = document.getElementById('aria-announcer');
    if (announcer) {
        announcer.textContent = message;
        // Clear after announcement is read
        setTimeout(() => { announcer.textContent = ''; }, 1000);
    }
}

function announceFilterChange() {
    const count = document.getElementById('filtered-count').textContent;
    const total = document.getElementById('total-count').textContent;
    announce(`Showing ${count} of ${total} responses`);
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
    // Clear localStorage
    try { localStorage.removeItem('surveyFilters'); } catch (e) { /* ignore */ }
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
    'chart-modeling-pain': { column: 'modeling_pain_points', limit: 10 },
    'chart-education': { column: 'education_topic', limit: 10 }
};

async function updateCharts() {
    // Show skeletons immediately for visual feedback
    if (!compareMode) {
        for (const chartId of Object.keys(chartConfig)) {
            showChartSkeleton(document.getElementById(chartId));
        }
    }
    
    const whereClause = getWhereClause();
    
    // Get total filtered count for percentage calculations
    const totalResult = await conn.query(`SELECT COUNT(*) as count FROM survey ${whereClause}`);
    const totalFiltered = Number(totalResult.toArray()[0].count);
    
    for (const [chartId, config] of Object.entries(chartConfig)) {
        if (compareMode) {
            await renderComparisonChart(chartId, config.column, config.limit);
        } else {
            await renderBarChart(chartId, config.column, whereClause, config.limit, totalFiltered);
        }
    }
}

// ===== Drill-down from Charts =====
function drillDownToResponses(column, value) {
    // Switch to responses tab
    const responsesTab = document.querySelector('.tab[data-tab="responses"]');
    if (responsesTab) {
        responsesTab.click();
        // After a brief delay to let the tab activate, scroll to top
        setTimeout(() => {
            const responsesContent = document.getElementById('responses-tab');
            if (responsesContent) responsesContent.scrollTop = 0;
        }, 100);
    }
}

function showChartSkeleton(container) {
    let html = '<div class="chart-skeleton">';
    for (let i = 0; i < 5; i++) {
        html += `
            <div class="chart-skeleton-row">
                <div class="chart-skeleton-label"></div>
                <div class="chart-skeleton-bar"></div>
                <div class="chart-skeleton-value"></div>
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
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
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
                        <path d="M4 4h8v1H4V4zm0 3h8v1H4V7zm0 3h5v1H4v-1z"/>
                    </svg>
                    <p>No data matches these filters</p>
                </div>`;
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
            
            // Start bars at width: 0 for animated entrance
            html += `
                <div class="chart-bar-row chart-bar-clickable ${activeClass}" 
                     data-column="${column}" 
                     data-value="${encodedValue}"
                     title="Click to filter by ${escapeHtml(row.label)}">
                    <span class="chart-bar-label">${escapeHtml(label)}</span>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" data-target-width="${barWidth}" style="width: 0%; background: ${color};"></div>
                    </div>
                    <span class="chart-bar-value">${displayValue}</span>
                </div>
            `;
        });
        
        // Drill-down link when chart filters are active
        if (activeFilterValue) {
            const filteredCount = rows.find(r => r.label === activeFilterValue);
            if (filteredCount) {
                html += `
                    <button class="chart-drilldown" data-column="${column}" data-value="${encodeURIComponent(activeFilterValue)}">
                        View ${Number(filteredCount.count).toLocaleString()} matching responses →
                    </button>`;
            }
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Animate bars to target width
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.querySelectorAll('.chart-bar-fill').forEach(fill => {
                    fill.style.width = fill.dataset.targetWidth + '%';
                });
            });
        });
        
        // Attach click handlers to bars
        container.querySelectorAll('.chart-bar-clickable').forEach(bar => {
            bar.addEventListener('click', () => {
                const col = bar.dataset.column;
                const value = decodeURIComponent(bar.dataset.value);
                addChartFilter(col, value);
            });
        });
        
        // Drill-down click handler
        container.querySelectorAll('.chart-drilldown').forEach(btn => {
            btn.addEventListener('click', () => {
                drillDownToResponses(btn.dataset.column, decodeURIComponent(btn.dataset.value));
            });
        });
        
    } catch (error) {
        console.error(`Error rendering chart ${chartId}:`, error);
        container.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
    }
}

// ===== Tab Navigation =====
// Tabs that should show the filter panel
const TABS_WITH_FILTERS = ['charts', 'crosstab', 'responses'];

function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');
    
    // Set initial filter panel state based on active tab
    updateFilterPanelVisibility();
    
    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            // Update tab states
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update content visibility
            const targetId = `${tab.dataset.tab}-tab`;
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
            
            // Lazy-load CodeMirror when SQL tab is first activated
            if (tab.dataset.tab === 'sql' && !editor) {
                await ensureSqlEditorReady();
            }
            
            // Update filter panel visibility
            updateFilterPanelVisibility();
            
            // Update URL
            updateUrlState();
        });
    });
}

function updateFilterPanelVisibility() {
    const activeTab = document.querySelector('.tab.active');
    const filterPanel = document.querySelector('.filter-panel');
    const mainContent = document.querySelector('.main-content');
    
    if (!activeTab || !filterPanel) return;
    
    const showFilters = TABS_WITH_FILTERS.includes(activeTab.dataset.tab);
    
    if (showFilters) {
        filterPanel.classList.remove('hidden-for-tab');
        mainContent.classList.remove('no-filter-panel');
    } else {
        filterPanel.classList.add('hidden-for-tab');
        mainContent.classList.add('no-filter-panel');
    }
}

function initializeChartMetricToggle() {
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

// ===== SQL Editor (Lazy-loaded) =====
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function loadStylesheet(href) {
    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = resolve; // Don't block on CSS failure
        document.head.appendChild(link);
    });
}

async function loadCodeMirror() {
    if (codeMirrorLoaded) return;
    if (codeMirrorLoading) {
        while (!codeMirrorLoaded) {
            await new Promise(r => setTimeout(r, 50));
        }
        return;
    }
    codeMirrorLoading = true;
    
    // Load CSS files
    await Promise.all([
        loadStylesheet('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css'),
        loadStylesheet('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css')
    ]);
    
    // Load JS files sequentially (mode depends on core)
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js');
    
    codeMirrorLoaded = true;
    codeMirrorLoading = false;
}

function initializeSqlEditorPlaceholder() {
    // Set up basic event handlers; full editor loads on first SQL tab activation
    document.getElementById('run-query').addEventListener('click', async () => {
        await ensureSqlEditorReady();
        runQuery();
    });
    
    // Example queries
    document.querySelectorAll('.example-query').forEach(btn => {
        btn.addEventListener('click', async () => {
            await ensureSqlEditorReady();
            editor.setValue(btn.dataset.query);
            runQuery();
        });
    });
    
    // Export SQL results
    document.getElementById('export-sql-results').addEventListener('click', exportSqlResults);
}

async function ensureSqlEditorReady() {
    if (editor) return;
    
    const textarea = document.getElementById('sql-editor');
    const sqlContainer = textarea.closest('.sql-editor-wrapper');
    
    // Show loading state
    textarea.placeholder = 'Loading SQL editor...';
    textarea.disabled = true;
    
    await loadCodeMirror();
    
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
    
    // Ctrl+Enter to run
    editor.setOption('extraKeys', {
        'Ctrl-Enter': runQuery,
        'Cmd-Enter': runQuery
    });
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
        
        // Save to query history
        saveSqlQuery(sql, duration);
        
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
        container.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5 4a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm-.5 2.5A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zM5 8a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm0 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5z"/>
                    <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/>
                </svg>
                <p>Query returned no results</p>
                <span class="empty-state-hint">Try adjusting your query or filters</span>
            </div>`;
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

// ===== Chart Export =====
function initializeChartExport() {
    // Add export buttons to chart cards
    document.querySelectorAll('.chart-card').forEach(card => {
        const header = card.querySelector('h3');
        if (header && !card.querySelector('.chart-export-btn')) {
            const exportBtn = document.createElement('button');
            exportBtn.className = 'btn btn-ghost chart-export-btn';
            exportBtn.title = 'Download chart as PNG';
            exportBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                </svg>
            `;
            
            // Create header wrapper
            const headerWrapper = document.createElement('div');
            headerWrapper.className = 'chart-card-header';
            header.parentNode.insertBefore(headerWrapper, header);
            headerWrapper.appendChild(header);
            headerWrapper.appendChild(exportBtn);
            
            exportBtn.addEventListener('click', () => exportChartAsPng(card));
        }
    });
}

async function exportChartAsPng(chartCard) {
    const title = chartCard.querySelector('h3').textContent;
    const chartContainer = chartCard.querySelector('.chart');
    
    // Create a canvas to render the chart
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Get chart dimensions
    const rect = chartCard.getBoundingClientRect();
    const scale = 2; // Higher resolution
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    ctx.scale(scale, scale);
    
    // Draw background
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    ctx.fillStyle = isDark ? '#161b22' : '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    // Draw title
    ctx.fillStyle = isDark ? '#e6edf3' : '#1f2328';
    ctx.font = 'bold 16px IBM Plex Sans, sans-serif';
    ctx.fillText(title, 24, 32);
    
    // Draw bars
    const bars = chartContainer.querySelectorAll('.chart-bar-row');
    let y = 56;
    const barHeight = 28;
    const labelWidth = 160;
    const barMaxWidth = rect.width - labelWidth - 100;
    
    bars.forEach((bar, i) => {
        const label = bar.querySelector('.chart-bar-label').textContent;
        const value = bar.querySelector('.chart-bar-value').textContent;
        const fill = bar.querySelector('.chart-bar-fill');
        const widthPct = parseFloat(fill.style.width) || 0;
        const color = fill.style.background || CHART_COLORS[i % CHART_COLORS.length];
        
        // Draw label
        ctx.fillStyle = isDark ? '#8b949e' : '#656d76';
        ctx.font = '13px IBM Plex Sans, sans-serif';
        ctx.fillText(truncateText(label, 24), 24, y + 18);
        
        // Draw bar background
        ctx.fillStyle = isDark ? '#1c2128' : '#f6f8fa';
        ctx.fillRect(labelWidth, y, barMaxWidth, 24);
        
        // Draw bar fill
        ctx.fillStyle = color;
        ctx.fillRect(labelWidth, y, barMaxWidth * (widthPct / 100), 24);
        
        // Draw value
        ctx.fillStyle = isDark ? '#e6edf3' : '#1f2328';
        ctx.font = 'bold 13px IBM Plex Sans, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(value, rect.width - 24, y + 18);
        ctx.textAlign = 'left';
        
        y += barHeight + 4;
    });
    
    // Add watermark
    ctx.fillStyle = isDark ? '#6e7681' : '#8c959f';
    ctx.font = '11px IBM Plex Sans, sans-serif';
    ctx.fillText('2026 State of Data Engineering Survey • thepracticaldata.com', 24, rect.height - 12);
    
    // Download
    const link = document.createElement('a');
    link.download = `chart-${title.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// ===== Chart Tooltip =====
let tooltipEl = null;

function initializeChartTooltip() {
    // Create tooltip element
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    tooltipEl.innerHTML = `
        <div class="chart-tooltip-label"></div>
        <div class="chart-tooltip-value"></div>
    `;
    document.body.appendChild(tooltipEl);
    
    // Delegate hover events on chart bars
    document.addEventListener('mouseover', (e) => {
        const bar = e.target.closest('.chart-bar-clickable');
        if (!bar) return;
        
        const label = bar.querySelector('.chart-bar-label').textContent;
        const value = bar.querySelector('.chart-bar-value').textContent;
        const fill = bar.querySelector('.chart-bar-fill');
        const widthPct = parseFloat(fill.style.width) || 0;
        
        // Get the count and percent info
        const isPercent = chartMetric === 'percent';
        const countText = isPercent ? value : `<strong>${value}</strong> responses`;
        const pctText = isPercent ? `<strong>${value}</strong>` : `<strong>${widthPct.toFixed(1)}%</strong> of filtered`;
        
        tooltipEl.querySelector('.chart-tooltip-label').textContent = label;
        tooltipEl.querySelector('.chart-tooltip-value').innerHTML = isPercent 
            ? `${pctText} (click to filter)` 
            : `${countText} &middot; ${pctText}`;
        tooltipEl.classList.add('visible');
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!tooltipEl.classList.contains('visible')) return;
        const x = Math.min(e.clientX + 12, window.innerWidth - tooltipEl.offsetWidth - 8);
        const y = Math.min(e.clientY + 12, window.innerHeight - tooltipEl.offsetHeight - 8);
        tooltipEl.style.left = `${x}px`;
        tooltipEl.style.top = `${y}px`;
    });
    
    document.addEventListener('mouseout', (e) => {
        const bar = e.target.closest('.chart-bar-clickable');
        if (bar) {
            // Check if we're moving to a child element within the bar
            const related = e.relatedTarget;
            if (related && bar.contains(related)) return;
            tooltipEl.classList.remove('visible');
        }
    });
}

// ===== Share Button =====
function initializeShareButton() {
    const shareBtn = document.getElementById('share-btn');
    
    shareBtn.addEventListener('click', async () => {
        const url = getShareableUrl();
        
        try {
            await navigator.clipboard.writeText(url);
            showToast('Link copied to clipboard!', 'success');
        } catch (err) {
            // Fallback: show URL in prompt
            prompt('Copy this link:', url);
        }
    });
}

// ===== Theme Toggle =====
function initializeThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    
    // Check for saved preference or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'dark'); // Default to dark
    
    if (initialTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        iconDark.style.display = 'none';
        iconLight.style.display = 'block';
    }
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        if (newTheme === 'light') {
            iconDark.style.display = 'none';
            iconLight.style.display = 'block';
        } else {
            iconDark.style.display = 'block';
            iconLight.style.display = 'none';
        }
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
    wrapToggle.addEventListener('change', () => {
        // Just re-render, don't re-query
        if (crosstabData) {
            renderCrosstabTable();
        }
    });
    
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

// Crosstab sorting state
let crosstabSortCol = null; // null = sort by row total, or column value
let crosstabSortDir = 'desc'; // 'asc' or 'desc'
let crosstabData = null; // Store last crosstab data for re-sorting

function isMultiSelect(column) {
    return MULTI_SELECT_COLUMNS.includes(column);
}

async function updateCrosstab() {
    const rowCol = document.getElementById('crosstab-rows').value;
    const colCol = document.getElementById('crosstab-cols').value;
    const metric = document.getElementById('crosstab-metric').value;
    const container = document.getElementById('crosstab-results');
    
    if (rowCol === colCol) {
        container.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
                    <path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
                </svg>
                <p>Select different dimensions</p>
                <span class="empty-state-hint">Row and column dimensions must be different to create a crosstab</span>
            </div>`;
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
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
                    </svg>
                    <p>No data matches these filters</p>
                    <span class="empty-state-hint">Try removing some filters to see more results</span>
                </div>`;
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
        
        // Store data for sorting
        crosstabData = {
            rows, cols, matrix, rowTotals, colTotals, grandTotal, rowCol, colCol, metric
        };
        
        // Reset sort when data changes
        crosstabSortCol = '_total';
        crosstabSortDir = 'desc';
        
        renderCrosstabTable();
        
    } catch (error) {
        console.error('Crosstab error:', error);
        container.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
    }
}

function renderCrosstabTable() {
    if (!crosstabData) return;
    
    const { rows, cols, matrix, rowTotals, colTotals, grandTotal, rowCol, colCol, metric } = crosstabData;
    const container = document.getElementById('crosstab-results');
    const columnLabels = getColumnLabel();
    const wrapText = document.getElementById('crosstab-wrap-text').checked;
    const wrapClass = wrapText ? ' wrap-text' : '';
    
    // Calculate values for sorting and display
    const rowData = rows.map(row => {
        const values = {};
        for (const col of cols) {
            const count = matrix.get(`${row}|||${col}`) || 0;
            if (metric === 'row_pct') {
                values[col] = rowTotals.get(row) > 0 ? (count / rowTotals.get(row)) * 100 : 0;
            } else if (metric === 'col_pct') {
                values[col] = colTotals.get(col) > 0 ? (count / colTotals.get(col)) * 100 : 0;
            } else {
                values[col] = count;
            }
        }
        return { row, values, total: rowTotals.get(row) };
    });
    
    // Sort rows
    rowData.sort((a, b) => {
        let aVal, bVal;
        if (crosstabSortCol === '_total') {
            aVal = a.total;
            bVal = b.total;
        } else {
            aVal = a.values[crosstabSortCol] || 0;
            bVal = b.values[crosstabSortCol] || 0;
        }
        return crosstabSortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    // Find max value for heatmap
    let maxValue = 0;
    for (const rd of rowData) {
        for (const col of cols) {
            maxValue = Math.max(maxValue, rd.values[col] || 0);
        }
    }
    
    // Build the table
    let html = `<table class="crosstab-table${wrapClass}">`;
    
    // Header row with sortable columns
    html += '<thead><tr>';
    html += `<th class="crosstab-corner">${columnLabels[rowCol]} / ${columnLabels[colCol]}</th>`;
    for (const col of cols) {
        const displayCol = wrapText ? col : truncateText(col, 15);
        const isActive = crosstabSortCol === col;
        const sortIcon = isActive ? (crosstabSortDir === 'desc' ? ' ↓' : ' ↑') : '';
        const activeClass = isActive ? ' sort-active' : '';
        html += `<th class="crosstab-col-header crosstab-sortable${activeClass}" data-sort-col="${encodeURIComponent(col)}" title="Click to sort by ${escapeHtml(col)}">${escapeHtml(displayCol)}${sortIcon}</th>`;
    }
    const totalActive = crosstabSortCol === '_total';
    const totalSortIcon = totalActive ? (crosstabSortDir === 'desc' ? ' ↓' : ' ↑') : '';
    const totalActiveClass = totalActive ? ' sort-active' : '';
    html += `<th class="crosstab-total-header crosstab-sortable${totalActiveClass}" data-sort-col="_total" title="Click to sort by total">Total${totalSortIcon}</th>`;
    html += '</tr></thead>';
    
    // Data rows
    html += '<tbody>';
    for (const rd of rowData) {
        html += '<tr>';
        const displayRow = wrapText ? rd.row : truncateText(rd.row, 25);
        html += `<th class="crosstab-row-header" title="${escapeHtml(rd.row)}">${escapeHtml(displayRow)}</th>`;
        
        for (const col of cols) {
            const value = rd.values[col] || 0;
            const count = matrix.get(`${rd.row}|||${col}`) || 0;
            let displayValue;
            
            if (metric === 'row_pct' || metric === 'col_pct') {
                displayValue = value > 0 ? `${value.toFixed(1)}%` : '–';
            } else {
                displayValue = value > 0 ? value.toLocaleString() : '–';
            }
            
            const intensity = maxValue > 0 ? value / maxValue : 0;
            const bgColor = getHeatmapColor(intensity);
            const textColor = intensity > 0.5 ? '#ffffff' : 'var(--color-text-primary)';
            
            html += `<td class="crosstab-cell" style="background: ${bgColor}; color: ${textColor};" title="${count} responses">${displayValue}</td>`;
        }
        
        html += `<td class="crosstab-row-total">${rd.total.toLocaleString()}</td>`;
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
    
    // Add click handlers for sorting
    container.querySelectorAll('.crosstab-sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = decodeURIComponent(th.dataset.sortCol);
            if (crosstabSortCol === col) {
                // Toggle direction
                crosstabSortDir = crosstabSortDir === 'desc' ? 'asc' : 'desc';
            } else {
                crosstabSortCol = col;
                crosstabSortDir = 'desc';
            }
            renderCrosstabTable();
        });
    });
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
    
    // Search input for responses
    let searchDebounce = null;
    const searchInput = document.getElementById('responses-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                responsesSearchTerm = searchInput.value.trim();
                responsesPage = 0;
                updateResponses();
            }, 300);
        });
    }
    
    // Export filtered CSV
    document.getElementById('export-filtered-csv').addEventListener('click', exportFilteredCsv);
    
    // Export filtered JSON
    const jsonBtn = document.getElementById('export-filtered-json');
    if (jsonBtn) {
        jsonBtn.addEventListener('click', exportFilteredJson);
    }
    
    // Initial load
    updateResponses();
}

async function updateResponses() {
    const container = document.getElementById('responses-results');
    const showTextFields = document.getElementById('show-text-fields').checked;
    
    try {
        let whereClause = getWhereClause();
        
        // Add search term to WHERE clause
        if (responsesSearchTerm) {
            const escapedSearch = responsesSearchTerm.replace(/'/g, "''");
            const searchCondition = `(
                education_topic ILIKE '%${escapedSearch}%' 
                OR industry_wish ILIKE '%${escapedSearch}%'
                OR role ILIKE '%${escapedSearch}%'
                OR industry ILIKE '%${escapedSearch}%'
                OR region ILIKE '%${escapedSearch}%'
            )`;
            whereClause = whereClause 
                ? `${whereClause} AND ${searchCondition}`
                : `WHERE ${searchCondition}`;
        }
        
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
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                        <path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z"/>
                    </svg>
                    <p>No responses match these filters</p>
                    <span class="empty-state-hint">Try adjusting or clearing your filters</span>
                </div>`;
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
            showToast('No data to export with current filters', 'error');
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

// ===== JSON Export =====
async function exportFilteredJson() {
    try {
        const whereClause = getWhereClause();
        const query = `SELECT * FROM survey ${whereClause} ORDER BY timestamp DESC`;
        const result = await conn.query(query);
        const rows = result.toArray();
        
        if (rows.length === 0) {
            showToast('No data to export with current filters', 'error');
            return;
        }
        
        // Get column names
        const columns = result.schema.fields.map(f => f.name);
        
        // Build JSON array
        const jsonData = rows.map(row => {
            const obj = {};
            for (const col of columns) {
                obj[col] = row[col];
            }
            return obj;
        });
        
        // Download
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `survey_filtered_${rows.length}_responses.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        showToast(`Exported ${rows.length} responses as JSON`, 'success');
    } catch (error) {
        console.error('JSON export error:', error);
        showToast('Error exporting data: ' + error.message, 'error');
    }
}

// ===== Toast Notifications =====
function showToast(message, type = 'default', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
        icon = `<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
        </svg>`;
    } else if (type === 'error') {
        icon = `<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
            <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
        </svg>`;
    }
    
    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== Scroll to Top =====
function initializeScrollToTop() {
    const btn = document.getElementById('scroll-to-top');
    if (!btn) return;
    
    // Find the scrollable container (report tab or main content)
    const scrollContainers = [
        document.getElementById('report-tab'),
        document.getElementById('charts-tab'),
        document.querySelector('.content-area')
    ];
    
    // Show/hide based on scroll position
    const checkScroll = () => {
        const activeContent = document.querySelector('.tab-content.active');
        if (activeContent && activeContent.scrollTop > 300) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    };
    
    // Add scroll listeners to tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.addEventListener('scroll', checkScroll);
    });
    
    // Also listen on window for report tab which might scroll differently
    window.addEventListener('scroll', checkScroll);
    
    // Scroll to top on click
    btn.addEventListener('click', () => {
        const activeContent = document.querySelector('.tab-content.active');
        if (activeContent) {
            activeContent.scrollTo({ top: 0, behavior: 'smooth' });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ===== Report TOC Scroll Spy =====
function initializeReportToc() {
    const tocLinks = document.querySelectorAll('.toc-link');
    const sections = document.querySelectorAll('#report-tab [id^="section-"]');
    const reportTab = document.getElementById('report-tab');
    
    if (!tocLinks.length || !sections.length) return;
    
    // Smooth scroll on click
    tocLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').slice(1);
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    // Scroll spy: prefer the topmost visible section so Introduction wins when at top
    const sectionIds = Array.from(sections).map(s => s.getAttribute('id'));
    const intersectingIds = new Set();

    const setActiveFromIntersecting = () => {
        const ordered = sectionIds.filter(id => intersectingIds.has(id));
        const activeId = ordered[0] || 'section-intro'; // default to Introduction
        tocLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${activeId}`) {
                link.classList.add('active');
            }
        });
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const id = entry.target.getAttribute('id');
            if (entry.isIntersecting) {
                intersectingIds.add(id);
            } else {
                intersectingIds.delete(id);
            }
        });
        setActiveFromIntersecting();
    }, {
        root: reportTab,
        rootMargin: '-15% 0px -70% 0px',
        threshold: 0
    });

    sections.forEach(section => observer.observe(section));
}

// ===== Keyboard Shortcuts =====
function initializeKeyboardShortcuts() {
    const TAB_KEYS = { '1': 'report', '2': 'charts', '3': 'crosstab', '4': 'responses', '5': 'sql' };
    
    document.addEventListener('keydown', (e) => {
        // Skip if user is typing in an input, textarea, or contenteditable
        const target = e.target;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || 
                         target.tagName === 'SELECT' || target.isContentEditable;
        
        // CodeMirror elements
        const isCodeMirror = target.closest('.CodeMirror');
        
        if (isTyping || isCodeMirror) {
            // Only handle Escape in inputs
            if (e.key === 'Escape') {
                target.blur();
                closeAllModals();
            }
            return;
        }
        
        // ? — Show shortcuts help
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
            e.preventDefault();
            toggleShortcutsModal();
            return;
        }
        
        // Escape — Close modals / clear focus
        if (e.key === 'Escape') {
            closeAllModals();
            closeMobileMenu();
            return;
        }
        
        // / — Focus first filter
        if (e.key === '/') {
            e.preventDefault();
            const firstFilter = document.getElementById('filter-role');
            if (firstFilter) {
                // On mobile, open filter panel first
                const filterPanel = document.querySelector('.filter-panel');
                if (window.innerWidth <= 900 && !filterPanel.classList.contains('open')) {
                    document.getElementById('mobile-menu-toggle').click();
                }
                firstFilter.focus();
            }
            return;
        }
        
        // 1-5 — Switch tabs
        if (TAB_KEYS[e.key]) {
            e.preventDefault();
            const tabBtn = document.querySelector(`.tab[data-tab="${TAB_KEYS[e.key]}"]`);
            if (tabBtn) tabBtn.click();
            return;
        }
    });
}

function closeAllModals() {
    const aboutModal = document.getElementById('about-modal');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    
    if (aboutModal.classList.contains('open')) {
        aboutModal.classList.remove('open');
        document.body.style.overflow = '';
    }
    if (shortcutsModal.classList.contains('open')) {
        shortcutsModal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// ===== Shortcuts Modal =====
function initializeShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    const closeBtn = document.getElementById('close-shortcuts-modal');
    const footerBtn = document.getElementById('keyboard-shortcuts-btn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('open');
            document.body.style.overflow = '';
        });
    }
    
    if (footerBtn) {
        footerBtn.addEventListener('click', () => toggleShortcutsModal());
    }
    
    // Close on backdrop click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('open');
                document.body.style.overflow = '';
            }
        });
    }
}

function toggleShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (!modal) return;
    
    if (modal.classList.contains('open')) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    } else {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

// ===== SQL Query History =====
const SQL_HISTORY_KEY = 'sqlQueryHistory';
const SQL_HISTORY_MAX = 20;

function getSqlHistory() {
    try {
        return JSON.parse(localStorage.getItem(SQL_HISTORY_KEY) || '[]');
    } catch { return []; }
}

function saveSqlQuery(sql, duration) {
    try {
        const history = getSqlHistory();
        // Don't save duplicates of the most recent query
        if (history.length > 0 && history[0].sql === sql) return;
        
        history.unshift({
            sql: sql.trim(),
            time: new Date().toISOString(),
            duration
        });
        // Keep only the last N
        if (history.length > SQL_HISTORY_MAX) history.length = SQL_HISTORY_MAX;
        localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(history));
    } catch { /* ignore */ }
}

function clearSqlHistory() {
    try { localStorage.removeItem(SQL_HISTORY_KEY); } catch { /* ignore */ }
}

function initializeSqlHistory() {
    const btn = document.getElementById('sql-history-btn');
    const dropdown = document.getElementById('sql-history-dropdown');
    const clearBtn = document.getElementById('sql-history-clear');
    const list = document.getElementById('sql-history-list');
    
    if (!btn || !dropdown) return;
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
            renderSqlHistory();
        }
    });
    
    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSqlHistory();
        renderSqlHistory();
        showToast('Query history cleared', 'success');
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) {
            dropdown.classList.remove('open');
        }
    });
}

function renderSqlHistory() {
    const list = document.getElementById('sql-history-list');
    const history = getSqlHistory();
    
    if (history.length === 0) {
        list.innerHTML = '<div class="sql-history-empty">No queries yet. Run a query to see it here.</div>';
        return;
    }
    
    list.innerHTML = history.map((item, i) => {
        const timeAgo = formatTimeAgo(item.time);
        const preview = item.sql.replace(/\s+/g, ' ').substring(0, 80);
        return `
            <button class="sql-history-item" data-idx="${i}" title="${escapeHtml(item.sql)}">
                ${escapeHtml(preview)}${item.sql.length > 80 ? '...' : ''}
                <span class="sql-history-time">${timeAgo}${item.duration ? ` • ${item.duration}ms` : ''}</span>
            </button>`;
    }).join('');
    
    list.querySelectorAll('.sql-history-item').forEach(item => {
        item.addEventListener('click', async () => {
            const history = getSqlHistory();
            const query = history[parseInt(item.dataset.idx)];
            if (query) {
                await ensureSqlEditorReady();
                editor.setValue(query.sql);
                document.getElementById('sql-history-dropdown').classList.remove('open');
                // Switch to SQL tab if not already
                const sqlTab = document.querySelector('.tab[data-tab="sql"]');
                if (sqlTab && !sqlTab.classList.contains('active')) {
                    sqlTab.click();
                }
            }
        });
    });
}

function formatTimeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString();
}

// ===== Comparison Mode =====
function initializeComparisonMode() {
    const toggleBtn = document.getElementById('compare-toggle');
    const controls = document.getElementById('compare-controls');
    const dimSelect = document.getElementById('compare-dim');
    const valASelect = document.getElementById('compare-val-a');
    const valBSelect = document.getElementById('compare-val-b');
    const runBtn = document.getElementById('compare-run');
    
    if (!toggleBtn || !controls) return;
    
    toggleBtn.addEventListener('click', () => {
        compareMode = !compareMode;
        toggleBtn.classList.toggle('active', compareMode);
        controls.classList.toggle('visible', compareMode);
        
        if (compareMode) {
            populateCompareValues();
        } else {
            updateCharts();
        }
    });
    
    dimSelect.addEventListener('change', () => {
        populateCompareValues();
    });
    
    runBtn.addEventListener('click', () => {
        updateCharts();
    });
}

async function populateCompareValues() {
    const dim = document.getElementById('compare-dim').value;
    const valASelect = document.getElementById('compare-val-a');
    const valBSelect = document.getElementById('compare-val-b');
    
    try {
        const result = await conn.query(`
            SELECT DISTINCT ${dim} as value, COUNT(*) as count
            FROM survey
            WHERE ${dim} IS NOT NULL
            GROUP BY ${dim}
            ORDER BY count DESC
            LIMIT 20
        `);
        
        const rows = result.toArray();
        
        const makeOptions = (select, defaultIdx) => {
            select.innerHTML = '';
            rows.forEach((row, i) => {
                const opt = document.createElement('option');
                opt.value = row.value;
                opt.textContent = `${row.value} (${Number(row.count).toLocaleString()})`;
                if (i === defaultIdx) opt.selected = true;
                select.appendChild(opt);
            });
        };
        
        makeOptions(valASelect, 0);
        makeOptions(valBSelect, Math.min(1, rows.length - 1));
        
    } catch (e) {
        console.error('Compare populate error:', e);
    }
}

async function renderComparisonChart(chartId, column, limit) {
    const container = document.getElementById(chartId);
    const dim = document.getElementById('compare-dim').value;
    const valA = document.getElementById('compare-val-a').value;
    const valB = document.getElementById('compare-val-b').value;
    
    if (!valA || !valB) {
        container.innerHTML = '<p class="placeholder-text">Select two segments to compare</p>';
        return;
    }
    
    try {
        const escapedA = valA.replace(/'/g, "''");
        const escapedB = valB.replace(/'/g, "''");
        
        // Get base filter clause (from sidebar)
        const baseWhere = getWhereClause();
        const wherePrefix = baseWhere ? `${baseWhere} AND` : 'WHERE';
        
        // Query for segment A
        const queryA = `
            SELECT ${column} as label, COUNT(*) as count
            FROM survey
            ${wherePrefix} ${dim} = '${escapedA}' AND ${column} IS NOT NULL
            GROUP BY ${column}
            ORDER BY count DESC
            LIMIT ${limit}
        `;
        
        // Query for segment B
        const queryB = `
            SELECT ${column} as label, COUNT(*) as count
            FROM survey
            ${wherePrefix} ${dim} = '${escapedB}' AND ${column} IS NOT NULL
            GROUP BY ${column}
            ORDER BY count DESC
            LIMIT ${limit}
        `;
        
        // Total counts for percentages
        const totalAQuery = `SELECT COUNT(*) as c FROM survey ${wherePrefix} ${dim} = '${escapedA}'`;
        const totalBQuery = `SELECT COUNT(*) as c FROM survey ${wherePrefix} ${dim} = '${escapedB}'`;
        
        const [resultA, resultB, totalAResult, totalBResult] = await Promise.all([
            conn.query(queryA),
            conn.query(queryB),
            conn.query(totalAQuery),
            conn.query(totalBQuery)
        ]);
        
        const rowsA = resultA.toArray();
        const rowsB = resultB.toArray();
        const totalA = Number(totalAResult.toArray()[0].c);
        const totalB = Number(totalBResult.toArray()[0].c);
        
        // Merge labels from both
        const allLabels = new Set();
        const mapA = new Map();
        const mapB = new Map();
        
        rowsA.forEach(r => { allLabels.add(r.label); mapA.set(r.label, Number(r.count)); });
        rowsB.forEach(r => { allLabels.add(r.label); mapB.set(r.label, Number(r.count)); });
        
        // Sort by combined count
        const labels = Array.from(allLabels).sort((a, b) => {
            return ((mapA.get(b) || 0) + (mapB.get(b) || 0)) - ((mapA.get(a) || 0) + (mapB.get(a) || 0));
        }).slice(0, limit);
        
        if (labels.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>No data for this comparison</p></div>`;
            return;
        }
        
        const maxCount = Math.max(
            ...labels.map(l => Math.max(mapA.get(l) || 0, mapB.get(l) || 0))
        );
        
        let html = '<div class="chart-bar-container">';
        
        labels.forEach(label => {
            const countA = mapA.get(label) || 0;
            const countB = mapB.get(label) || 0;
            const widthA = maxCount > 0 ? (countA / maxCount) * 100 : 0;
            const widthB = maxCount > 0 ? (countB / maxCount) * 100 : 0;
            
            let valADisp, valBDisp;
            if (chartMetric === 'percent') {
                valADisp = totalA > 0 ? `${((countA / totalA) * 100).toFixed(1)}%` : '0%';
                valBDisp = totalB > 0 ? `${((countB / totalB) * 100).toFixed(1)}%` : '0%';
            } else {
                valADisp = countA.toLocaleString();
                valBDisp = countB.toLocaleString();
            }
            
            html += `
                <div class="chart-bar-row">
                    <span class="chart-bar-label">${escapeHtml(truncateText(label, 28))}</span>
                    <div class="compare-bar-group">
                        <div class="compare-bar-track">
                            <div class="compare-bar-fill-a" data-target-width="${widthA}" style="width: 0%;"></div>
                        </div>
                        <div class="compare-bar-track">
                            <div class="compare-bar-fill-b" data-target-width="${widthB}" style="width: 0%;"></div>
                        </div>
                    </div>
                    <div class="compare-values">
                        <span class="compare-val-a">${valADisp}</span>
                        <span class="compare-val-b">${valBDisp}</span>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Animate bars
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.querySelectorAll('.compare-bar-fill-a, .compare-bar-fill-b').forEach(fill => {
                    fill.style.width = fill.dataset.targetWidth + '%';
                });
            });
        });
        
    } catch (error) {
        console.error(`Comparison chart error ${chartId}:`, error);
        container.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
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

