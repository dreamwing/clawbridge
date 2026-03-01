import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';
import semver from 'semver';
import translate from 'google-translate-api-x';

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
    console.error('GITHUB_TOKEN is required');
    process.exit(1);
}

const octokit = new Octokit({ auth: githubToken });
const repoOwner = 'dreamwing';
const repoName = 'clawbridge';
const bumpType = process.argv[2] || 'patch';

async function run() {
    console.log(`Starting release process (bump: ${bumpType})...`);

    // 1. Bump version
    const pkgPath = path.resolve('package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const currentVersion = pkg.version;
    const newVersion = semver.inc(currentVersion, bumpType);
    if (!newVersion) {
        console.error('Invalid version bump');
        process.exit(1);
    }

    execSync(`npm version ${bumpType} --no-git-tag-version`);
    console.log(`Bumped version from ${currentVersion} to ${newVersion}`);

    // 2. Read CHANGELOG.md [Unreleased] section
    const changelogPath = path.resolve('CHANGELOG.md');
    let changelog = fs.readFileSync(changelogPath, 'utf8');

    const unreleasedMatch = changelog.match(/## \[Unreleased\]\n\n([\s\S]*?)(?=\n## \[|\n$|$)/);
    let unreleasedContent = (unreleasedMatch && unreleasedMatch[1].trim()) ? unreleasedMatch[1].trim() : '';

    if (!unreleasedContent) {
        console.warn('No manual unreleased changes found in CHANGELOG.md, will auto-generate from commits/PRs...');
    }

    // 2.5 Supplement with Git Commits
    console.log('Supplementing changelog with unmentioned git commits...');
    try {
        // Find last tag
        const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        console.log(`Last tag: ${lastTag}`);

        // Get commits since last tag
        const logOut = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`, { encoding: 'utf8' });
        const commitLines = logOut.split('\n').filter(Boolean);

        const parsedCommits = { Added: [], Fixed: [], Changed: [], Removed: [] };

        for (const msg of commitLines) {
            if (unreleasedContent.includes(msg)) continue; // Skip if exact phrase already written by user

            // Basic conventional commit parsing
            if (msg.startsWith('feat:') || msg.startsWith('feat(')) {
                parsedCommits.Added.push(`- ${msg.replace(/^feat(?:\(.*\))?:/, '').trim()}`);
            } else if (msg.startsWith('fix:') || msg.startsWith('fix(') || msg.startsWith('perf')) {
                parsedCommits.Fixed.push(`- ${msg.replace(/^(?:fix|perf)(?:\(.*\))?:/, '').trim()}`);
            } else if (msg.startsWith('refactor') || msg.startsWith('docs') || msg.startsWith('style') || msg.startsWith('chore')) {
                // Skip chore/merge commits generally, keep others as Changed
                if (!msg.startsWith('chore') && !msg.startsWith('Merge')) {
                    parsedCommits.Changed.push(`- ${msg.replace(/^(?:refactor|docs|style)(?:\(.*\))?:/, '').trim()}`);
                }
            }
        }

        // Append missing commits to their respective headers if they aren't already there
        for (const [section, items] of Object.entries(parsedCommits)) {
            if (items.length === 0) continue;

            const sectionHeader = `### ${section}`;
            const hasSection = unreleasedContent.includes(sectionHeader);

            // Filter items to ensure we don't add something that conceptually matches user's manual entry
            const addedItems = items.filter(item => {
                // rough fuzzy check: if 60% of words match some line in unreleased, skip it
                const words = item.toLowerCase().split(/\W+/).filter(w => w.length > 3);
                return !words.some(w => unreleasedContent.toLowerCase().includes(w));
            });

            if (addedItems.length === 0) continue;

            if (hasSection) {
                // Find section header and append below it
                const parts = unreleasedContent.split(sectionHeader);
                unreleasedContent = parts[0] + sectionHeader + '\n' + addedItems.join('\n') + parts.slice(1).join(sectionHeader);
            } else {
                // Create section at the bottom
                unreleasedContent += `\n\n### ${section}\n` + addedItems.join('\n');
            }
        }

        unreleasedContent = unreleasedContent.trim();
    } catch (e) {
        console.warn('Could not parse git commit history or no previous tags found:', e.message);
    }

    // 3. Find unique issue numbers
    const issueRegex = /#(\d+)/g;
    const issueMatches = [...unreleasedContent.matchAll(issueRegex)];
    const issueNumbers = [...new Set(issueMatches.map(m => parseInt(m[1], 10)))];

    console.log(`Found issues in changelog: ${issueNumbers.join(', ')}`);

    // 4. Fetch issue bodies and look for credits (including issue openers)
    const creditsFound = []; // { user: 'username', issue: 12 }
    const creditsSeen = new Set(); // dedup key: 'user:issue'

    function addCredit(user, issueNum) {
        const key = `${user.toLowerCase()}:${issueNum}`;
        if (creditsSeen.has(key)) return;
        if (user.toLowerCase() === repoOwner.toLowerCase()) return;
        if (user.includes('[bot]')) return;
        creditsSeen.add(key);
        creditsFound.push({ user, issue: issueNum });
    }

    for (const issueNum of issueNumbers) {
        try {
            const { data: issue } = await octokit.rest.issues.get({
                owner: repoOwner,
                repo: repoName,
                issue_number: issueNum
            });

            // Credit the issue opener
            if (issue.user && issue.user.login) {
                addCredit(issue.user.login, issueNum);
                console.log(`Found issue opener @${issue.user.login} for #${issueNum}`);
            }

            // Also look for explicit credit mentions in issue body
            const body = issue.body || '';
            const creditRegex = /(?:Suggested by|Credits|Thanks to|感谢)[:\s]*@([A-Za-z0-9_-]+)/gi;
            let match;
            while ((match = creditRegex.exec(body)) !== null) {
                addCredit(match[1], issueNum);
                console.log(`Found explicit credit for @${match[1]} in issue #${issueNum}`);
            }
        } catch (e) {
            console.warn(`Could not fetch issue #${issueNum}:`, e.message);
        }
    }

    // 4.5 Fetch merged PR authors for credits
    console.log('Scanning merged PRs for contributor credits...');
    try {
        const lastTagForPR = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        const mergeLog = execSync(
            `git log ${lastTagForPR}..HEAD --merges --pretty=format:"%s"`,
            { encoding: 'utf8' }
        );
        const prNumbers = new Set();

        // Extract PR numbers from merge commits
        for (const line of mergeLog.split('\n').filter(Boolean)) {
            const m = line.match(/Merge pull request #(\d+)/);
            if (m) prNumbers.add(parseInt(m[1], 10));
        }
        // Also check #NN references from changelog (they might be PRs)
        for (const num of issueNumbers) prNumbers.add(num);

        for (const prNum of prNumbers) {
            try {
                const { data: pr } = await octokit.rest.pulls.get({
                    owner: repoOwner,
                    repo: repoName,
                    pull_number: prNum
                });
                if (pr.user && pr.user.login) {
                    addCredit(pr.user.login, prNum);
                    console.log(`Found PR author @${pr.user.login} from PR #${prNum}`);
                }
            } catch {
                // Not a PR or fetch failed, skip silently
            }
        }
    } catch (e) {
        console.warn('Could not scan merged PRs:', e.message);
    }

    // 5. Append credits to the changelog lines if they don't already exist
    let lines = unreleasedContent.split('\n');
    for (const credit of creditsFound) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`#${credit.issue}`)) {
                if (!lines[i].includes(`@${credit.user}`)) {
                    lines[i] = `${lines[i]} (Thanks @${credit.user} for suggesting #${credit.issue})`;
                }
            }
        }
    }
    const processedEnglishContent = lines.join('\n');

    // 6. Translate to Chinese
    console.log('Translating changelog to Chinese...');
    let translatedContent = '';
    try {
        const res = await translate(processedEnglishContent, { to: 'zh-CN' });
        translatedContent = res.text || processedEnglishContent;

        // Fix common translation headers
        translatedContent = translatedContent
            .replace(/### 修复/ig, '### Fixed')
            .replace(/### 添加/ig, '### Added')
            .replace(/### 新增/ig, '### Added')
            .replace(/### 已添加/ig, '### Added')
            .replace(/### 已修复/ig, '### Fixed')
            .replace(/### Added/, '### 新增')
            .replace(/### Fixed/, '### 修复')
            .replace(/### Changed/, '### 变更')
            .replace(/### Removed/, '### 移除');
    } catch (e) {
        console.warn('Translation failed, using original English for Chinese changelog:', e.message);
        translatedContent = processedEnglishContent;
    }

    // 7. Update CHANGELOG.md
    const today = new Date().toISOString().split('T')[0];
    const newReleaseHeader = `## [${newVersion}] - ${today}`;

    const newChangelog = changelog.replace(
        /## \[Unreleased\]\n\n[\s\S]*?(?=\n## \[|\n$|$)/,
        `## [Unreleased]\n\n${newReleaseHeader}\n\n${processedEnglishContent}\n`
    );
    fs.writeFileSync(changelogPath, newChangelog, 'utf8');

    // 8. Update CHANGELOG_CN.md
    const changelogCnPath = path.resolve('CHANGELOG_CN.md');
    let changelogCn = '';
    if (fs.existsSync(changelogCnPath)) {
        changelogCn = fs.readFileSync(changelogCnPath, 'utf8');
        if (changelogCn.includes('## [Unreleased]')) {
            changelogCn = changelogCn.replace(
                /## \[Unreleased\]\n\n[\s\S]*?(?=\n## \[|\n$|$)/,
                `## [Unreleased]\n\n${newReleaseHeader}\n\n${translatedContent}\n`
            );
        } else {
            const headerIndex = changelogCn.indexOf('## [');
            if (headerIndex !== -1) {
                changelogCn = changelogCn.substring(0, headerIndex) + `## [Unreleased]\n\n${newReleaseHeader}\n\n${translatedContent}\n\n` + changelogCn.substring(headerIndex);
            } else {
                changelogCn = `# 更新日志\n\n## [Unreleased]\n\n${newReleaseHeader}\n\n${translatedContent}\n`;
            }
        }
    } else {
        // Scaffold initial Chinese Changelog
        changelogCn = `# 更新日志\n\n本项目的所有显著更改都将记录在此文件中。\n\n## [Unreleased]\n\n${newReleaseHeader}\n\n${translatedContent}\n`;
    }
    fs.writeFileSync(changelogCnPath, changelogCn, 'utf8');

    // 9. Update README.md and README_CN.md Credits
    const newContributors = [...new Set(creditsFound.map(c => c.user))];

    if (newContributors.length > 0) {
        console.log(`Updating READMEs with new contributors: ${newContributors.join(', ')}`);

        for (const file of ['README.md', 'README_CN.md']) {
            const readmePath = path.resolve(file);
            if (fs.existsSync(readmePath)) {
                let readme = fs.readFileSync(readmePath, 'utf8');
                let creditsIndex = readme.indexOf('## Credits');
                if (creditsIndex === -1) creditsIndex = readme.indexOf('## 鸣谢');

                if (creditsIndex !== -1) {
                    let readmeLines = readme.split('\n');
                    let creditLineIndex = -1;
                    for (let i = 0; i < readmeLines.length; i++) {
                        if (readmeLines[i].startsWith('## Credits') || readmeLines[i].startsWith('## 鸣谢')) {
                            creditLineIndex = i;
                            break;
                        }
                    }

                    if (creditLineIndex !== -1) {
                        let insertIndex = creditLineIndex + 1;
                        while (insertIndex < readmeLines.length && !readmeLines[insertIndex].startsWith('## ') && !readmeLines[insertIndex].startsWith('---')) {
                            insertIndex++;
                        }

                        for (const user of newContributors) {
                            if (!readme.includes(`[@${user}](https://github.com/${user})`)) {
                                readmeLines.splice(insertIndex - 1, 0, `- [@${user}](https://github.com/${user}) for valuable contributions and suggestions.`);
                                insertIndex++;
                            }
                        }
                        fs.writeFileSync(readmePath, readmeLines.join('\n'), 'utf8');
                    }
                }
            }
        }
    }

    // 10. Commit, Tag, Push
    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');

    try {
        execSync('git add package.json package-lock.json CHANGELOG.md CHANGELOG_CN.md README.md README_CN.md');
        execSync(`git commit -m "chore(release): v${newVersion}"`);
        execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
        console.log('Pushing to remote...');
        execSync('git push origin master');
        execSync(`git push origin v${newVersion}`);
    } catch (e) {
        console.error('Git operations failed:', e.message);
        if (e.stdout) console.log(e.stdout.toString());
        process.exit(1);
    }

    // 11. Create Release
    try {
        console.log('Creating GitHub Release...');
        await octokit.rest.repos.createRelease({
            owner: repoOwner,
            repo: repoName,
            tag_name: `v${newVersion}`,
            name: `v${newVersion}`,
            body: processedEnglishContent
        });
        console.log('Release published successfully!');
    } catch (e) {
        console.error('Failed to create GitHub Release:', e.message);
    }
}

run();
