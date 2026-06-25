-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS github_analyzer;
USE github_analyzer;

-- Create table to store analyzed profiles
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
    total_repo_size_kb INT DEFAULT 0,
    average_repo_size_kb DECIMAL(15, 2) DEFAULT 0.00,
    fork_ratio DECIMAL(15, 2) DEFAULT 0.00,
    star_ratio DECIMAL(15, 2) DEFAULT 0.00,
    top_languages JSON, -- Stores languages and their count/percentage, e.g., [{"language": "JS", "count": 5, ...}]
    most_starred_repo_name VARCHAR(255),
    most_starred_repo_stars INT DEFAULT 0,
    most_starred_repo_url VARCHAR(255),
    created_at_github DATETIME,
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
