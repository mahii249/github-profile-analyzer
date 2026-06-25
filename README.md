# GitHub Profile Analyzer Backend

A Node.js and Express.js backend application that analyzes public GitHub profiles using the official GitHub REST API, calculates rich statistics (such as total repository stars, total forks, language distributions, and their top repository), and stores/updates these insights in a MySQL database.

This project was built for a college assignment submission and meets all requirements including proper architectural structure, database schemas, full CRUD backend APIs, and comprehensive setup documentation.

---

## Features

- **GitHub API Integration**: Fetches real-time public user profiles and up to 100 repositories.
- **Deep Profile Analysis**:
  - Aggregates **Total Stars** and **Total Forks** received across all public repositories.
  - Summarizes **Language Usage** and ranks languages by the number of repositories they appear in.
  - Identifies their **Most Starred Repository** details (name, stargazers count, URL).
- **MySQL Persistence**: Saves the analyzed profile data. Updates existing profiles automatically on subsequent requests (`INSERT ... ON DUPLICATE KEY UPDATE`).
- **REST APIs**:
  - `POST /api/profiles` to analyze and store a user profile.
  - `GET /api/profiles` to list all previously analyzed profiles.
  - `GET /api/profiles/:username` to fetch detailed database insights of a single user.

---

## Project Structure

```text
github-profile-analyzer/
├── config/
│   └── db.js            # MySQL connection configuration (mysql2 promise pool)
├── controllers/
│   └── profileController.js  # Business logic (GitHub fetching, analysis, SQL queries)
├── routes/
│   └── profileRoutes.js      # Express route definitions
├── .env                 # Environment configurations (Port, DB credentials, Git Token)
├── index.js             # Main server startup & middleware initialization
├── package.json         # Node.js dependencies & scripts
├── schema.sql           # Database and Table initialization DDL script
└── README.md            # Setup and instructions guide
```

---

## Setup Instructions

Follow these step-by-step instructions to run this project locally:

### Step 1: Prerequisites
Make sure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v14+ recommended)
- [MySQL Server](https://www.mysql.com/downloads/) (v5.7+ or v8.0+)
- A terminal/command prompt client

### Step 2: Database Initialization
1. Start your local MySQL server.
2. Open your MySQL client (e.g., MySQL Workbench, Command Line, or phpMyAdmin).
3. Import and execute the SQL commands found in the [schema.sql](file:///c:/Users/HP/github-profile-analyzer/schema.sql) file.
   *Alternatively, you can run the following SQL statements in your database query editor:*
   ```sql
   CREATE DATABASE IF NOT EXISTS github_analyzer;
   USE github_analyzer;

   CREATE TABLE IF NOT EXISTS github_profiles (
       id INT AUTO_INCREMENT PRIMARY KEY,
       username VARCHAR(100) NOT NULL UNIQUE,
       name VARCHAR(150),
       avatar_url VARCHAR(255),
       html_url VARCHAR(255),
       bio TEXT,
       company VARCHAR(150),
       location VARCHAR(150),
       public_repos INT DEFAULT 0,
       public_gists INT DEFAULT 0,
       followers INT DEFAULT 0,
       following INT DEFAULT 0,
       total_stars INT DEFAULT 0,
       total_forks INT DEFAULT 0,
       top_languages JSON,
       most_starred_repo_name VARCHAR(255),
       most_starred_repo_stars INT DEFAULT 0,
       most_starred_repo_url VARCHAR(255),
       created_at_github DATETIME,
       analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   );
   ```

### Step 3: Install Dependencies
Run the following command in the root folder of the project to install all necessary packages:
```bash
npm install
```

### Step 4: Environment Configurations
Create/edit the `.env` file in the root directory and update it with your MySQL credentials:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=github_analyzer

# Optional: Add a GitHub Personal Access Token (PAT) to prevent API rate limiting.
# GITHUB_TOKEN=your_github_token
```
> **Note**: While the public GitHub API works without a token, GitHub limits anonymous requests to 60 per hour. Setting a `GITHUB_TOKEN` increases the limit to 5,000 per hour. You can generate one at [GitHub Developer Settings](https://github.com/settings/tokens).

### Step 5: Start the Server
To start the application, use one of the npm scripts:

- **Development Mode** (auto-reloads on changes using Nodemon):
  ```bash
  npm run dev
  ```
- **Production Mode** (runs with standard Node.js):
  ```bash
  npm start
  ```

Once running successfully, you should see logs indicating a successful MySQL connection and Server starting:
```text
✅ Connected to MySQL database successfully!
🚀 Server is running on port 3000
📡 Base API URL: http://localhost:3000
```

---

## API Documentation

### 1. Welcome Endpoint
Returns basic API documentation and endpoint formats.
- **Method**: `GET`
- **URL**: `http://localhost:3000/`
- **Response**: `200 OK` (JSON)

### 2. Analyze Profile (Fetch & Store)
Sends a request to retrieve details for a GitHub user, perform the statistical analysis, and record/update it in the MySQL database.
- **Method**: `POST`
- **URL**: `http://localhost:3000/api/profiles`
- **Query Parameters**:
  - `force` (optional): Set to `true` (`?force=true`) to bypass database caching and fetch fresh data from GitHub.
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "username": "octocat",
    "force": false
  }
  ```
- **Response**: `200 OK` (JSON)
  - `source`: Indicates if the response came from `'github'`, `'cache'` (within 10-min cooldown), or `'cache_fallback'` (on GitHub API errors).
  - Example Response:
  ```json
  {
    "message": "GitHub profile analyzed and stored successfully.",
    "source": "github",
    "data": {
      "id": 1,
      "username": "octocat",
      "name": "The Octocat",
      "avatar_url": "https://avatars.githubusercontent.com/u/5832347?v=4",
      "html_url": "https://github.com/octocat",
      "bio": null,
      "company": "@github",
      "location": "San Francisco",
      "public_repos": 8,
      "public_gists": 8,
      "followers": 9000,
      "following": 9,
      "total_stars": 120,
      "total_forks": 50,
      "total_repo_size_kb": 1650,
      "average_repo_size_kb": 206.25,
      "fork_ratio": 6.25,
      "star_ratio": 15.00,
      "top_languages": [
        {
          "language": "Ruby",
          "count": 3,
          "total_size_kb": 1200,
          "count_percentage": 60,
          "size_percentage": 72.73
        },
        {
          "language": "HTML",
          "count": 2,
          "total_size_kb": 450,
          "count_percentage": 40,
          "size_percentage": 27.27
        }
      ],
      "most_starred_repo_name": "Spoon-Knife",
      "most_starred_repo_stars": 115,
      "most_starred_repo_url": "https://github.com/octocat/Spoon-Knife",
      "created_at_github": "2011-01-25T18:44:36.000Z",
      "analyzed_at": "2026-06-25T07:15:30.000Z"
    }
  }
  ```

### 3. Fetch Stored Profile List
Returns a paginated list of all profiles stored inside the database, supporting sorting and searching.
- **Method**: `GET`
- **URL**: `http://localhost:3000/api/profiles`
- **Query Parameters**:
  - `page` (optional): Page number (default: `1`).
  - `limit` (optional): Number of records per page (default: `10`).
  - `sortBy` (optional): Column to sort by (default: `analyzed_at`). Supported columns: `id`, `username`, `name`, `public_repos`, `followers`, `following`, `total_stars`, `total_forks`, `total_repo_size_kb`, `average_repo_size_kb`, `fork_ratio`, `star_ratio`, `analyzed_at`.
  - `order` (optional): Sort direction (default: `DESC`). Supported values: `ASC`, `DESC`.
  - `search` (optional): Search query matching username, name, location, or company.
- **Response**: `200 OK` (JSON)
  ```json
  {
    "pagination": {
      "total_records": 12,
      "total_pages": 2,
      "current_page": 1,
      "limit": 10,
      "has_next": true,
      "has_prev": false
    },
    "data": [...]
  }
  ```

### 4. Fetch Single Stored Profile
Returns database details of a specific username.
- **Method**: `GET`
- **URL**: `http://localhost:3000/api/profiles/:username`
- **Response**: `200 OK` (JSON) if exists; `404 Not Found` if the user has not been analyzed yet.
