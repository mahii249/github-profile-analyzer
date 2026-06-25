/* ==========================================================================
   GitScope - Core Frontend JavaScript
   Handles API consumption, chart visualization, and history management
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE MANAGEMENT ---
  let historyCurrentPage = 1;
  const historyPageLimit = 10;
  let pieChartInstance = null;
  let barChartInstance = null;

  // --- DOM ELEMENTS ---
  // Search Form
  const searchForm = document.getElementById('search-form');
  const usernameInput = document.getElementById('username-input');
  const forceCheckbox = document.getElementById('force-checkbox');
  const searchBtn = document.getElementById('search-btn');

  // Status Alerts
  const statusAlert = document.getElementById('status-alert');

  // Dashboard Containers
  const skeletonLoader = document.getElementById('skeleton-loader');
  const dashboardPanel = document.getElementById('dashboard-panel');

  // Profile Details
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userLogin = document.getElementById('user-login');
  const userGithubLink = document.getElementById('user-github-link');
  const statRepos = document.getElementById('stat-repos');
  const statFollowers = document.getElementById('stat-followers');
  const statFollowing = document.getElementById('stat-following');
  
  const detailBioItem = document.getElementById('detail-bio-item');
  const userBio = document.getElementById('user-bio');
  const userCompany = document.getElementById('user-company');
  const userLocation = document.getElementById('user-location');
  const userGists = document.getElementById('user-gists');
  const userJoined = document.getElementById('user-joined');
  const userAnalyzed = document.getElementById('user-analyzed');

  // Metric Values
  const metricTotalStars = document.getElementById('metric-total-stars');
  const metricTotalForks = document.getElementById('metric-total-forks');
  const metricTotalSize = document.getElementById('metric-total-size');
  const metricStarRatio = document.getElementById('metric-star-ratio');

  // Spotlight Repository
  const spotlightRepoName = document.getElementById('spotlight-repo-name');
  const spotlightRepoStars = document.getElementById('spotlight-repo-stars');
  const spotlightRepoLink = document.getElementById('spotlight-repo-link');

  // History Controls
  const historySearchInput = document.getElementById('history-search');
  const historySortBySelect = document.getElementById('history-sort-by');
  const historyOrderSelect = document.getElementById('history-order');
  const refreshHistoryBtn = document.getElementById('refresh-history-btn');
  const historyTableBody = document.getElementById('history-table-body');

  // History Pagination
  const paginationInfo = document.getElementById('pagination-info');
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');

  // --- INITIALIZATION ---
  fetchHistory();

  // --- EVENT LISTENERS ---
  
  // Search Form Submit
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const force = forceCheckbox.checked;
    
    if (username) {
      analyzeProfile(username, force);
    }
  });

  // History Searching (Debounced for performance)
  let searchTimeout;
  historySearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      historyCurrentPage = 1;
      fetchHistory();
    }, 400);
  });

  // History Sorting
  historySortBySelect.addEventListener('change', () => {
    historyCurrentPage = 1;
    fetchHistory();
  });

  historyOrderSelect.addEventListener('change', () => {
    historyCurrentPage = 1;
    fetchHistory();
  });

  // Refresh History Button
  refreshHistoryBtn.addEventListener('click', () => {
    fetchHistory();
  });

  // Pagination Buttons
  prevPageBtn.addEventListener('click', () => {
    if (historyCurrentPage > 1) {
      historyCurrentPage--;
      fetchHistory();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    historyCurrentPage++;
    fetchHistory();
  });


  // --- CORE FUNCTIONS ---

  /**
   * Triggers profile analysis by calling the POST API
   * @param {string} username - GitHub username
   * @param {boolean} force - Force cache bypass flag
   */
  async function analyzeProfile(username, force) {
    // UI State: Loading
    setLoadingState(true);
    showAlert('Analyzing GitHub profile... This may take a moment for large profiles.', 'info', 'fa-solid fa-spinner fa-spin');
    
    try {
      const response = await fetch(`/api/profiles?force=${force}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to analyze GitHub profile.');
      }

      const profile = result.data;
      
      // Bind data to the dashboard
      bindProfileData(profile);
      
      // Render Charts
      renderCharts(profile.top_languages || []);
      
      // UI State: Success
      setLoadingState(false);
      
      let successMessage = 'Profile analyzed and stored successfully!';
      if (result.source === 'cache') {
        successMessage = 'Retrieved recently analyzed profile from database cache.';
      } else if (result.source === 'cache_fallback') {
        successMessage = 'GitHub API rate limit exceeded. Loaded cached database record.';
        showAlert(successMessage, 'info', 'fa-solid fa-triangle-exclamation');
        fetchHistory(); // refresh list
        return;
      }
      
      showAlert(successMessage, 'success', 'fa-solid fa-circle-check');
      
      // Refresh the history list
      fetchHistory();

    } catch (error) {
      console.error('Error during profile analysis:', error);
      setLoadingState(false);
      showAlert(error.message, 'error', 'fa-solid fa-circle-exclamation');
    }
  }

  /**
   * Fetches previously analyzed profiles from the GET API with pagination and filters
   */
  async function fetchHistory() {
    const search = historySearchInput.value.trim();
    const sortBy = historySortBySelect.value;
    const order = historyOrderSelect.value;
    
    let url = `/api/profiles?page=${historyCurrentPage}&limit=${historyPageLimit}&sortBy=${sortBy}&order=${order}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    try {
      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch history.');
      }

      renderHistoryTable(result.data, result.pagination);
    } catch (error) {
      console.error('Error fetching history:', error);
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-rose-400">
            <i class="fa-solid fa-circle-exclamation"></i> Error loading history: ${error.message}
          </td>
        </tr>
      `;
    }
  }

  /**
   * Deletes a profile from the database using the DELETE API
   * @param {string} username - Username of profile to delete
   */
  async function deleteProfile(username) {
    if (!confirm(`Are you sure you want to delete the stored analysis for '${username}'?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/profiles/${username}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete profile.');
      }

      showAlert(`Successfully deleted profile analysis for '${username}'.`, 'success', 'fa-solid fa-trash-can');
      
      // Refresh history
      fetchHistory();
    } catch (error) {
      console.error('Error deleting profile:', error);
      showAlert(`Delete failed: ${error.message}`, 'error', 'fa-solid fa-circle-exclamation');
    }
  }

  // --- UI BINDING HELPERS ---

  /**
   * Sets the UI state to loading (shows skeleton, disables buttons)
   * @param {boolean} isLoading 
   */
  function setLoadingState(isLoading) {
    if (isLoading) {
      searchBtn.disabled = true;
      searchBtn.querySelector('.btn-text').textContent = 'Analyzing...';
      skeletonLoader.classList.remove('hidden');
      dashboardPanel.classList.add('hidden');
    } else {
      searchBtn.disabled = false;
      searchBtn.querySelector('.btn-text').textContent = 'Analyze Profile';
      skeletonLoader.classList.add('hidden');
    }
  }

  /**
   * Displays a status alert banner at the top
   * @param {string} message - Message to display
   * @param {string} type - 'success', 'error', or 'info'
   * @param {string} iconClass - FontAwesome icon class
   */
  function showAlert(message, type, iconClass) {
    statusAlert.className = `alert ${type}`;
    
    // Find or create icon
    const icon = statusAlert.querySelector('.alert-icon');
    icon.className = `alert-icon ${iconClass}`;
    
    // Set message
    statusAlert.querySelector('.alert-message').textContent = message;
    
    // Remove hidden
    statusAlert.classList.remove('hidden');
    
    // Auto scroll to alert
    statusAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Binds profile and repository analysis data to the dashboard UI elements
   * @param {object} profile - Profile data object from backend
   */
  function bindProfileData(profile) {
    dashboardPanel.classList.remove('hidden');

    // Avatar and Login
    userAvatar.src = profile.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
    userAvatar.alt = `${profile.username}'s avatar`;
    userName.textContent = profile.name || profile.username;
    userLogin.textContent = `@${profile.username}`;
    userGithubLink.href = profile.html_url;

    // Numerical statistics
    statRepos.textContent = profile.public_repos;
    statFollowers.textContent = formatNumber(profile.followers);
    statFollowing.textContent = formatNumber(profile.following);

    // Bio
    if (profile.bio) {
      userBio.textContent = profile.bio;
      detailBioItem.classList.remove('hidden');
    } else {
      detailBioItem.classList.add('hidden');
    }

    // Details List
    userCompany.textContent = profile.company || 'Not Specified';
    userLocation.textContent = profile.location || 'Not Specified';
    userGists.textContent = profile.public_gists;
    userJoined.textContent = formatDate(profile.created_at_github);
    userAnalyzed.textContent = new Date(profile.analyzed_at).toLocaleString();

    // Summary Metric Cards
    metricTotalStars.textContent = formatNumber(profile.total_stars);
    metricTotalForks.textContent = formatNumber(profile.total_forks);
    metricTotalSize.textContent = formatSize(profile.total_repo_size_kb);
    metricStarRatio.textContent = profile.star_ratio;

    // Spotlight Top Repo
    if (profile.most_starred_repo_name) {
      spotlightRepoName.textContent = profile.most_starred_repo_name;
      spotlightRepoStars.textContent = formatNumber(profile.most_starred_repo_stars);
      spotlightRepoLink.href = profile.most_starred_repo_url;
      document.getElementById('spotlight-section').classList.remove('hidden');
    } else {
      document.getElementById('spotlight-section').classList.add('hidden');
    }
  }

  /**
   * Render paginated history database table
   * @param {Array} profiles - List of profiles from backend
   * @param {object} pagination - Pagination metadata
   */
  function renderHistoryTable(profiles, pagination) {
    if (!profiles || profiles.length === 0) {
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted">
            <i class="fa-solid fa-folder-open"></i> No records found in the database.
          </td>
        </tr>
      `;
      paginationInfo.textContent = 'Showing 0 of 0 records';
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      return;
    }

    // Populate Table
    let rowsHtml = '';
    profiles.forEach(p => {
      const avatarSrc = p.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
      const formattedDate = new Date(p.analyzed_at).toLocaleDateString();
      const displayName = p.name || p.username;

      rowsHtml += `
        <tr>
          <td>
            <div class="profile-col-cell">
              <img src="${avatarSrc}" alt="${p.username}" class="history-avatar">
              <div class="profile-info-cell">
                <span class="history-name">${displayName}</span>
                <span class="history-username">@${p.username}</span>
              </div>
            </div>
          </td>
          <td>${p.public_repos}</td>
          <td>${formatNumber(p.followers)}</td>
          <td><i class="fa-solid fa-star star-color"></i> ${formatNumber(p.total_stars)}</td>
          <td><i class="fa-solid fa-code-branch text-muted"></i> ${formatNumber(p.total_forks)}</td>
          <td>${formattedDate}</td>
          <td class="actions-col">
            <div class="actions-cell-content">
              <button class="btn-sm-primary btn-load-profile" data-username="${p.username}">
                <i class="fa-solid fa-folder-open"></i> Load
              </button>
              <button class="btn-sm-danger btn-delete-profile" data-username="${p.username}">
                <i class="fa-solid fa-trash-can"></i> Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    historyTableBody.innerHTML = rowsHtml;

    // Add Action Listeners
    document.querySelectorAll('.btn-load-profile').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const username = e.currentTarget.getAttribute('data-username');
        analyzeProfile(username, false);
      });
    });

    document.querySelectorAll('.btn-delete-profile').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const username = e.currentTarget.getAttribute('data-username');
        deleteProfile(username);
      });
    });

    // Update Pagination Info & Buttons
    const startRecord = (pagination.current_page - 1) * pagination.limit + 1;
    const endRecord = Math.min(pagination.current_page * pagination.limit, pagination.total_records);
    paginationInfo.textContent = `Showing ${startRecord}-${endRecord} of ${pagination.total_records} records`;

    prevPageBtn.disabled = !pagination.has_prev;
    nextPageBtn.disabled = !pagination.has_next;
  }

  /**
   * Renders language statistics charts using Chart.js
   * @param {Array} languages - Enriched language list from backend
   */
  function renderCharts(languages) {
    const ctxPie = document.getElementById('language-pie-chart').getContext('2d');
    const ctxBar = document.getElementById('language-bar-chart').getContext('2d');

    // Safely destroy existing charts before rendering new ones
    if (pieChartInstance) pieChartInstance.destroy();
    if (barChartInstance) barChartInstance.destroy();

    if (!languages || languages.length === 0) {
      // Draw empty placeholder texts on canvases or handle beautifully
      ctxPie.clearRect(0, 0, 300, 300);
      ctxBar.clearRect(0, 0, 300, 300);
      return;
    }

    // Chart.js Theme Colors (matched with CSS design system accents)
    const colorPalette = [
      'rgba(99, 102, 241, 0.85)',  // Indigo
      'rgba(6, 182, 212, 0.85)',  // Cyan
      'rgba(139, 92, 246, 0.85)', // Violet
      'rgba(244, 63, 94, 0.85)',  // Rose
      'rgba(251, 191, 36, 0.85)',  // Gold
      'rgba(16, 185, 129, 0.85)',  // Emerald
      'rgba(249, 115, 22, 0.85)'   // Orange
    ];
    const hoverColorPalette = colorPalette.map(color => color.replace('0.85', '1.0'));
    const borderColor = 'rgba(255, 255, 255, 0.1)';

    // --- 1. PREPARE PIE/DOUGHNUT CHART DATA (Repo Share) ---
    // Show top 5 languages, aggregate the rest
    let pieLabels = [];
    let pieData = [];

    if (languages.length <= 6) {
      pieLabels = languages.map(l => l.language);
      pieData = languages.map(l => l.count);
    } else {
      const topLanguages = languages.slice(0, 5);
      const otherLanguages = languages.slice(5);
      const otherCount = otherLanguages.reduce((sum, l) => sum + l.count, 0);

      pieLabels = [...topLanguages.map(l => l.language), 'Other'];
      pieData = [...topLanguages.map(l => l.count), otherCount];
    }

    // Create Doughnut Chart
    pieChartInstance = new Chart(ctxPie, {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieData,
          backgroundColor: colorPalette.slice(0, pieLabels.length),
          hoverBackgroundColor: hoverColorPalette.slice(0, pieLabels.length),
          borderColor: borderColor,
          borderWidth: 1.5,
          spacing: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#9ca3af',
              font: {
                family: 'Inter',
                size: 11
              },
              padding: 14,
              boxWidth: 12,
              boxHeight: 12,
              usePointStyle: true
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.raw;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return ` ${context.label}: ${value} repos (${percentage}%)`;
              }
            }
          }
        },
        cutout: '70%'
      }
    });

    // --- 2. PREPARE BAR CHART DATA (Size Distribution) ---
    // Show top 6 languages by code size
    const sortedBySize = [...languages].sort((a, b) => b.total_size_kb - a.total_size_kb).slice(0, 6);
    const barLabels = sortedBySize.map(l => l.language);
    const barData = sortedBySize.map(l => l.total_size_kb);

    // Create Horizontal Bar Chart
    barChartInstance = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [{
          label: 'Code Size (KB)',
          data: barData,
          backgroundColor: 'rgba(6, 182, 212, 0.45)',
          borderColor: 'var(--accent-cyan)',
          borderWidth: 1.5,
          borderRadius: 4,
          hoverBackgroundColor: 'rgba(6, 182, 212, 0.75)'
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false // hide dataset legend
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return ` Size: ${formatSize(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#6b7280',
              font: {
                family: 'Inter',
                size: 10
              },
              callback: function(value) {
                return value >= 1024 ? `${(value/1024).toFixed(0)}MB` : `${value}KB`;
              }
            }
          },
          y: {
            grid: {
              display: false
            },
            ticks: {
              color: '#9ca3af',
              font: {
                family: 'Inter',
                size: 11
              }
            }
          }
        }
      }
    });
  }

  // --- GENERAL UTILITY HELPERS ---

  /**
   * Formats numbers cleanly (e.g. 1500 to 1.5K)
   * @param {number} num 
   */
  function formatNumber(num) {
    if (!num && num !== 0) return '-';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Formats code size in KB to a human-readable format (MB or KB)
   * @param {number} sizeKb 
   */
  function formatSize(sizeKb) {
    if (!sizeKb && sizeKb !== 0) return '-';
    if (sizeKb >= 1024 * 10) { // If size > 10MB, display in MB
      return (sizeKb / 1024).toFixed(1) + ' MB';
    }
    return sizeKb.toLocaleString() + ' KB';
  }

  /**
   * Formats ISO Date string to "Month Day, Year"
   * @param {string} dateStr 
   */
  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
});
