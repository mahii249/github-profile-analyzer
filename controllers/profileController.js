const axios = require('axios');
const db = require('../config/db');
require('dotenv').config();

// Bypass SSL certificate verification issues for local environments (e.g., behind proxies/firewalls)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Cache duration in minutes, default to 10
const CACHE_DURATION_MINUTES = parseInt(process.env.CACHE_DURATION_MINUTES) || 10;

// Helper function to build GitHub API headers (including Token if provided to prevent rate limit issues)
const getGithubHeaders = () => {
  const headers = {
    'User-Agent': 'github-profile-analyzer',
    'Accept': 'application/vnd.github.v3+json'
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
};

// 1. Analyze and Store/Update Profile Insights
exports.analyzeProfile = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required and must be a valid string.' });
    }

    const cleanUsername = username.trim();
    console.log(`🔍 Analyzing profile for GitHub user: ${cleanUsername}`);

    // Fetch existing profile to check for cache validity
    const [existingRows] = await db.query('SELECT * FROM github_profiles WHERE username = ?', [cleanUsername]);
    const existingProfile = existingRows[0];

    // Check if force refresh is requested
    const isForceRefresh = req.query.force === 'true' || req.body.force === true;

    if (existingProfile && !isForceRefresh) {
      const analyzedAt = new Date(existingProfile.analyzed_at);
      const now = new Date();
      const timeDifferenceMs = now - analyzedAt;
      const cooldownMs = CACHE_DURATION_MINUTES * 60 * 1000;

      if (timeDifferenceMs < cooldownMs) {
        console.log(`⚡ Returning cached profile for: ${cleanUsername} (Analyzed ${Math.round(timeDifferenceMs / 1000 / 60)}m ago)`);
        
        // Parse top_languages if stored as string
        if (existingProfile.top_languages && typeof existingProfile.top_languages === 'string') {
          try {
            existingProfile.top_languages = JSON.parse(existingProfile.top_languages);
          } catch (e) {
            // ignore parsing error
          }
        }

        return res.status(200).json({
          message: 'GitHub profile retrieved from database cache (recently analyzed).',
          source: 'cache',
          data: existingProfile
        });
      }
    }

    // Fetch user profile data from GitHub
    let profileResponse;
    try {
      profileResponse = await axios.get(`https://api.github.com/users/${cleanUsername}`, {
        headers: getGithubHeaders()
      });
    } catch (githubErr) {
      if (githubErr.response && githubErr.response.status === 404) {
        return res.status(404).json({ error: `GitHub user '${cleanUsername}' not found.` });
      }
      
      // Fallback: If GitHub API fails (e.g. Rate Limit / Network Down), return cached data if available
      if (existingProfile) {
        console.warn(`⚠️ GitHub API call failed. Falling back to cached profile for: ${cleanUsername}`);
        
        if (existingProfile.top_languages && typeof existingProfile.top_languages === 'string') {
          try {
            existingProfile.top_languages = JSON.parse(existingProfile.top_languages);
          } catch (e) {
            // ignore parsing error
          }
        }

        return res.status(200).json({
          message: 'GitHub API request failed due to rate limits or network issues. Returning cached database record.',
          source: 'cache_fallback',
          warning: githubErr.message,
          data: existingProfile
        });
      }
      throw githubErr;
    }

    const profileData = profileResponse.data;

    // Fetch user's public repositories (up to 100 for stats calculations)
    let reposResponse;
    try {
      reposResponse = await axios.get(`https://api.github.com/users/${cleanUsername}/repos?per_page=100`, {
        headers: getGithubHeaders()
      });
    } catch (repoErr) {
      // Fallback: If repositories fetch fails but we have cached profile data
      if (existingProfile) {
        console.warn(`⚠️ GitHub API repo call failed. Falling back to cached profile for: ${cleanUsername}`);
        
        if (existingProfile.top_languages && typeof existingProfile.top_languages === 'string') {
          try {
            existingProfile.top_languages = JSON.parse(existingProfile.top_languages);
          } catch (e) {
            // ignore parsing error
          }
        }

        return res.status(200).json({
          message: 'GitHub API repositories request failed. Returning cached database record.',
          source: 'cache_fallback',
          warning: repoErr.message,
          data: existingProfile
        });
      }
      throw repoErr;
    }

    const repos = reposResponse.data || [];

    // Calculate Insights
    let totalStars = 0;
    let totalForks = 0;
    let totalRepoSizeKb = 0;
    const languagesMap = {};
    let mostStarredRepo = null;

    repos.forEach(repo => {
      totalStars += repo.stargazers_count || 0;
      totalForks += repo.forks_count || 0;
      totalRepoSizeKb += repo.size || 0;

      // Track programming languages frequency and cumulative size
      if (repo.language) {
        if (!languagesMap[repo.language]) {
          languagesMap[repo.language] = { count: 0, total_size_kb: 0 };
        }
        languagesMap[repo.language].count += 1;
        languagesMap[repo.language].total_size_kb += repo.size || 0;
      }

      // Check for most starred repo
      if (!mostStarredRepo || (repo.stargazers_count > mostStarredRepo.stargazers_count)) {
        mostStarredRepo = repo;
      }
    });

    // Format top languages sorting by repository count descending
    const sortedLanguages = Object.entries(languagesMap)
      .map(([language, stats]) => ({
        language,
        count: stats.count,
        total_size_kb: stats.total_size_kb
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate percentages for languages
    const totalReposWithLanguage = sortedLanguages.reduce((sum, item) => sum + item.count, 0);
    const totalReposSizeWithLanguage = sortedLanguages.reduce((sum, item) => sum + item.total_size_kb, 0);

    const enrichedLanguages = sortedLanguages.map(item => ({
      ...item,
      count_percentage: totalReposWithLanguage > 0 ? parseFloat(((item.count / totalReposWithLanguage) * 100).toFixed(2)) : 0,
      size_percentage: totalReposSizeWithLanguage > 0 ? parseFloat(((item.total_size_kb / totalReposSizeWithLanguage) * 100).toFixed(2)) : 0
    }));

    // Calculate ratio/average metrics
    const publicReposCount = profileData.public_repos || 0;
    const averageRepoSizeKb = publicReposCount > 0 ? parseFloat((totalRepoSizeKb / publicReposCount).toFixed(2)) : 0;
    const forkRatio = publicReposCount > 0 ? parseFloat((totalForks / publicReposCount).toFixed(2)) : 0;
    const starRatio = publicReposCount > 0 ? parseFloat((totalStars / publicReposCount).toFixed(2)) : 0;

    // Prepare variables for database insertion
    const name = profileData.name || null;
    const avatarUrl = profileData.avatar_url || null;
    const htmlUrl = profileData.html_url || null;
    const bio = profileData.bio || null;
    const company = profileData.company || null;
    const location = profileData.location || null;
    const publicRepos = profileData.public_repos || 0;
    const publicGists = profileData.public_gists || 0;
    const followers = profileData.followers || 0;
    const following = profileData.following || 0;
    
    // Top languages stored as JSON string
    const topLanguagesJson = JSON.stringify(enrichedLanguages);

    const mostStarredRepoName = mostStarredRepo ? mostStarredRepo.name : null;
    const mostStarredRepoStars = mostStarredRepo ? mostStarredRepo.stargazers_count : 0;
    const mostStarredRepoUrl = mostStarredRepo ? mostStarredRepo.html_url : null;
    
    // GitHub timestamps are ISO strings, convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    const createdAtGithub = profileData.created_at ? new Date(profileData.created_at).toISOString().slice(0, 19).replace('T', ' ') : null;

    // Database SQL operation
    const sqlQuery = `
      INSERT INTO github_profiles (
        username, name, avatar_url, html_url, bio, company, location,
        public_repos, public_gists, followers, following,
        total_stars, total_forks, total_repo_size_kb, average_repo_size_kb, fork_ratio, star_ratio,
        top_languages,
        most_starred_repo_name, most_starred_repo_stars, most_starred_repo_url,
        created_at_github
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        avatar_url = VALUES(avatar_url),
        html_url = VALUES(html_url),
        bio = VALUES(bio),
        company = VALUES(company),
        location = VALUES(location),
        public_repos = VALUES(public_repos),
        public_gists = VALUES(public_gists),
        followers = VALUES(followers),
        following = VALUES(following),
        total_stars = VALUES(total_stars),
        total_forks = VALUES(total_forks),
        total_repo_size_kb = VALUES(total_repo_size_kb),
        average_repo_size_kb = VALUES(average_repo_size_kb),
        fork_ratio = VALUES(fork_ratio),
        star_ratio = VALUES(star_ratio),
        top_languages = VALUES(top_languages),
        most_starred_repo_name = VALUES(most_starred_repo_name),
        most_starred_repo_stars = VALUES(most_starred_repo_stars),
        most_starred_repo_url = VALUES(most_starred_repo_url);
    `;

    const values = [
      cleanUsername, name, avatarUrl, htmlUrl, bio, company, location,
      publicRepos, publicGists, followers, following,
      totalStars, totalForks, totalRepoSizeKb, averageRepoSizeKb, forkRatio, starRatio,
      topLanguagesJson,
      mostStarredRepoName, mostStarredRepoStars, mostStarredRepoUrl,
      createdAtGithub
    ];

    await db.query(sqlQuery, values);

    // Retrieve the fully updated database record to return
    const [rows] = await db.query('SELECT * FROM github_profiles WHERE username = ?', [cleanUsername]);
    const savedRecord = rows[0];

    // Parse top_languages JSON string back to object for response
    if (savedRecord && savedRecord.top_languages) {
      if (typeof savedRecord.top_languages === 'string') {
        try {
          savedRecord.top_languages = JSON.parse(savedRecord.top_languages);
        } catch (e) {
          // ignore parsing error
        }
      }
    }

    console.log(`✅ Profile analysis saved/updated successfully for: ${cleanUsername}`);
    return res.status(200).json({
      message: 'GitHub profile analyzed and stored successfully.',
      source: 'github',
      data: savedRecord
    });

  } catch (error) {
    console.error('❌ Error during profile analysis:', error.message);
    return res.status(500).json({
      error: 'An internal server error occurred while analyzing the profile.',
      details: error.message
    });
  }
};

// 2. Fetch All Stored Profiles with Pagination, Sorting & Filtering
exports.getAllProfiles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'analyzed_at';
    const order = (req.query.order || 'DESC').toUpperCase();
    const search = req.query.search || '';

    // Validate inputs to prevent SQL Injection
    const allowedSortColumns = [
      'id', 'username', 'name', 'public_repos', 'followers', 'following',
      'total_stars', 'total_forks', 'total_repo_size_kb', 'average_repo_size_kb',
      'fork_ratio', 'star_ratio', 'analyzed_at'
    ];
    
    if (!allowedSortColumns.includes(sortBy)) {
      return res.status(400).json({ error: `Invalid sortBy parameter. Must be one of: ${allowedSortColumns.join(', ')}` });
    }

    if (order !== 'ASC' && order !== 'DESC') {
      return res.status(400).json({ error: "Invalid order parameter. Must be 'ASC' or 'DESC'." });
    }

    if (page < 1 || limit < 1) {
      return res.status(400).json({ error: "Page and limit parameters must be positive integers." });
    }

    const offset = (page - 1) * limit;

    // Dynamically build queries
    let countQuery = 'SELECT COUNT(*) as total FROM github_profiles';
    let selectQuery = 'SELECT * FROM github_profiles';
    const queryParams = [];
    const countParams = [];

    if (search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      const filterClause = ' WHERE username LIKE ? OR name LIKE ? OR location LIKE ? OR company LIKE ?';
      countQuery += filterClause;
      selectQuery += filterClause;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Add sorting
    selectQuery += ` ORDER BY ${sortBy} ${order}`;

    // Add pagination (LIMIT and OFFSET)
    selectQuery += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    // Execute queries
    const [countRows] = await db.query(countQuery, countParams);
    const totalRecords = countRows[0].total;

    const [rows] = await db.query(selectQuery, queryParams);

    // Parse top_languages JSON for each profile in response
    const parsedRows = rows.map(row => {
      if (row.top_languages && typeof row.top_languages === 'string') {
        try {
          row.top_languages = JSON.parse(row.top_languages);
        } catch (e) {
          // ignore parsing error
        }
      }
      return row;
    });

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      pagination: {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        limit: limit,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      data: parsedRows
    });
  } catch (error) {
    console.error('❌ Error fetching stored profiles:', error.message);
    return res.status(500).json({
      error: 'An internal server error occurred while retrieving profiles.',
      details: error.message
    });
  }
};

// 3. Fetch Single Stored Profile Details
exports.getProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username parameter is required.' });
    }

    const [rows] = await db.query('SELECT * FROM github_profiles WHERE username = ?', [username.trim()]);

    if (rows.length === 0) {
      return res.status(404).json({
        error: `No stored profile analysis found for username '${username}'. Make sure to analyze it first using the POST API.`
      });
    }

    const profile = rows[0];
    if (profile.top_languages && typeof profile.top_languages === 'string') {
      try {
        profile.top_languages = JSON.parse(profile.top_languages);
      } catch (e) {
        // ignore parsing error
      }
    }

    return res.status(200).json({
      data: profile
    });
  } catch (error) {
    console.error('❌ Error fetching profile:', error.message);
    return res.status(500).json({
      error: 'An internal server error occurred while retrieving the profile.',
      details: error.message
    });
  }
};

// 4. Delete Stored Profile
exports.deleteProfile = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username parameter is required.' });
    }

    const cleanUsername = username.trim();
    console.log(`🗑️ Deleting profile for GitHub user: ${cleanUsername}`);

    const [result] = await db.query('DELETE FROM github_profiles WHERE username = ?', [cleanUsername]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: `No stored profile found for username '${cleanUsername}'.`
      });
    }

    console.log(`✅ Profile deleted successfully for: ${cleanUsername}`);
    return res.status(200).json({
      message: `Profile analysis for '${cleanUsername}' was successfully deleted.`
    });
  } catch (error) {
    console.error('❌ Error deleting profile:', error.message);
    return res.status(500).json({
      error: 'An internal server error occurred while deleting the profile.',
      details: error.message
    });
  }
};

