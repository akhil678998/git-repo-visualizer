import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import * as echarts from "echarts";
import { motion, AnimatePresence } from "framer-motion";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";

const API_BASE = "https://api.github.com";
const GITHUB_TOKEN =
  ""; // Replace with your token

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
}

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  parents: { sha: string }[];
  author?: { avatar_url: string; login: string };
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: any[];
}

interface Contributor {
  login: string;
  contributions: number;
  avatar_url: string;
}

const GitHubVisualizer: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState("main");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [activeTab, setActiveTab] = useState("charts");
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const commitChartRef = useRef<HTMLDivElement>(null);
  const networkChartRef = useRef<HTMLDivElement>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const match = searchInput.match(
      /(?:https?:\/\/github\.com\/)?([^/]+)\/([^/]+)/
    );

    if (match?.[1] && match?.[2]) {
      try {
        setError("");
        setIsLoading(true);
        const [owner, repo] = [match[1], match[2].replace(/\.git$/, "")];

        const repoInfo = await axios.get(`${API_BASE}/repos/${owner}/${repo}`, {
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
        });

        const defaultBranch = repoInfo.data.default_branch;

        const [branchesRes, treeRes, commitsRes, contributorsRes] =
          await Promise.all([
            axios.get(`${API_BASE}/repos/${owner}/${repo}/branches`, {
              headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
            }),
            axios.get(
              `${API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
              {
                headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
              }
            ),
            axios.get(`${API_BASE}/repos/${owner}/${repo}/commits`, {
              headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
              params: { per_page: 30 },
            }),
            axios.get(`${API_BASE}/repos/${owner}/${repo}/contributors`, {
              headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
            }),
          ]);

        setOwner(owner);
        setRepo(repo);
        setBranches(branchesRes.data.map((b: any) => b.name));
        setCurrentBranch(defaultBranch);
        setFileTree(processTreeData(treeRes.data.tree));
        setContributors(contributorsRes.data);

        // Fetch commit details with stats
        const commitsWithDetails = await Promise.all(
          commitsRes.data.map(async (commit: Commit) => {
            try {
              const commitDetails = await axios.get(
                `${API_BASE}/repos/${owner}/${repo}/commits/${commit.sha}`,
                { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
              );
              return {
                ...commit,
                stats: commitDetails.data.stats,
                files: commitDetails.data.files,
              };
            } catch (err) {
              console.error("Failed to fetch commit details:", err);
              return commit;
            }
          })
        );
        setCommits(commitsWithDetails);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          setError(
            err.response?.data?.message || "Failed to fetch repository data"
          );
        } else {
          setError("Failed to fetch repository data");
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      setError("Invalid repository format. Use: owner/repo or GitHub URL");
    }
  };

  const processTreeData = (tree: any[]): FileNode[] => {
    const root: FileNode = { name: "", path: "", type: "dir", children: [] };
    tree.forEach((item) => {
      const pathParts = item.path.split("/");
      let current = root;
      pathParts.forEach((part: string, index: number) => {
        const existing = current.children?.find((child) => child.name === part);
        if (existing) {
          current = existing;
        } else {
          const newNode: FileNode = {
            name: part,
            path: pathParts.slice(0, index + 1).join("/"),
            type:
              index === pathParts.length - 1
                ? item.type === "blob"
                  ? "file"
                  : "dir"
                : "dir",
            children: [],
          };
          current.children?.push(newNode);
          current = newNode;
        }
      });
    });
    return root.children || [];
  };

  useEffect(() => {
    if (owner && repo) {
      fetchBranchData();
    }
  }, [currentBranch]);

  const fetchBranchData = async () => {
    try {
      setIsLoading(true);
      const [treeRes, commitsRes] = await Promise.all([
        axios.get(
          `${API_BASE}/repos/${owner}/${repo}/git/trees/${currentBranch}?recursive=1`,
          {
            headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
          }
        ),
        axios.get(`${API_BASE}/repos/${owner}/${repo}/commits`, {
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
          params: { sha: currentBranch, per_page: 30 },
        }),
      ]);

      const commitsWithDetails = await Promise.all(
        commitsRes.data.map(async (commit: Commit) => {
          try {
            const commitDetails = await axios.get(
              `${API_BASE}/repos/${owner}/${repo}/commits/${commit.sha}`,
              { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
            );
            return {
              ...commit,
              stats: commitDetails.data.stats,
              files: commitDetails.data.files,
            };
          } catch (err) {
            console.error("Failed to fetch commit details:", err);
            return commit;
          }
        })
      );

      setFileTree(processTreeData(treeRes.data.tree));
      setCommits(commitsWithDetails);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to fetch branch data");
      } else {
        setError("Failed to fetch branch data");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && owner && repo) {
      const renderCharts = () => {
        [commitChartRef, networkChartRef].forEach((ref) => {
          if (ref.current) {
            echarts.dispose(ref.current);
          }
        });

        if (activeTab === "charts") {
          renderCommitChart();
          renderNetworkChart();
        }
      };

      renderCharts();
      window.addEventListener("resize", renderCharts);

      return () => {
        window.removeEventListener("resize", renderCharts);
        [commitChartRef, networkChartRef].forEach((ref) => {
          if (ref.current) {
            echarts.dispose(ref.current);
          }
        });
      };
    }
  }, [isLoading, commits, activeTab]);

  const renderCommitChart = () => {
    if (!commitChartRef.current) return;

    const commitData = commits.reduce(
      (acc: Record<string, Commit[]>, commit) => {
        const date = new Date(commit.commit.author.date).toLocaleDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(commit);
        return acc;
      },
      {}
    );

    const chart = echarts.init(commitChartRef.current);
    chart.setOption({
      title: { text: "Commit History", textStyle: { color: "#c9d1d9" } },
      backgroundColor: "#0d1117",
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const date = params[0].axisValue;
          const commitsOnDate = commitData[date] || [];
          let tooltip = `<div class="text-sm bg-gray-900 p-4 rounded-lg shadow-xl">`;
          tooltip += `<div class="font-bold text-blue-400 mb-2">${date}</div>`;
          tooltip += `<div class="grid gap-3">`;
          commitsOnDate.forEach((commit) => {
            tooltip += `
              <div class="border-b border-gray-700 pb-2 last:border-0">
                <div class="flex items-center gap-3">
                  <img src="${
                    commit.author?.avatar_url
                  }" class="w-6 h-6 rounded-full" />
                  <div class="flex-1">
                    <div class="font-medium text-gray-100">${
                      commit.commit.message.split("\n")[0]
                    }</div>
                    <div class="flex items-center gap-2 text-xs text-gray-400">
                      <span>${commit.author?.login || "Unknown"}</span>
                      <span>•</span>
                      <span>${new Date(
                        commit.commit.author.date
                      ).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
                <div class="mt-1 flex items-center gap-2 text-xs">
                  <span class="text-green-500">+${
                    commit.stats?.additions || 0
                  }</span>
                  <span class="text-red-500">-${
                    commit.stats?.deletions || 0
                  }</span>
                </div>
              </div>
            `;
          });
          tooltip += `</div></div>`;
          return tooltip;
        },
      },
      xAxis: {
        type: "category",
        data: Object.keys(commitData),
        axisLabel: { color: "#8b949e" },
      },
      yAxis: { type: "value", axisLabel: { color: "#8b949e" } },
      series: [
        {
          data: Object.values(commitData).map(
            (dateCommits) => dateCommits.length
          ),
          type: "bar",
          itemStyle: { color: "#238636" },
        },
      ],
    });
  };

  const renderNetworkChart = () => {
    if (!networkChartRef.current) return;

    const nodes = commits.map((commit) => ({
      id: commit.sha,
      name: commit.commit.message.substring(0, 20),
      symbolSize: 10,
      itemStyle: {
        color: commit.parents.length > 1 ? "#da3633" : "#58a6ff",
      },
    }));

    const links = commits.flatMap((commit) =>
      commit.parents.map((parent) => ({
        source: commit.sha,
        target: parent.sha,
      }))
    );

    const chart = echarts.init(networkChartRef.current);
    chart.setOption({
      title: { text: "Commit Network", textStyle: { color: "#c9d1d9" } },
      backgroundColor: "#0d1117",
      series: [
        {
          type: "graph",
          layout: "force",
          force: { repulsion: 1000 },
          data: nodes,
          links: links,
          roam: true,
          label: { color: "#c9d1d9" },
        },
      ],
    });
  };

  const slideIn = {
    hidden: { x: -100, opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: 100, opacity: 0 },
  };

  const fadeIn = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0 },
  };

  const slideUp = {
    hidden: { y: 50, opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: -50, opacity: 0 },
  };

  const scaleIn = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: { scale: 1, opacity: 1 },
  };
  const fetchFileContent = async (path: string) => {
    try {
      const response = await axios.get(
        `${API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${currentBranch}`,
        { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
      );
      setFileContent(atob(response.data.content));
      setSelectedFile(path);
    } catch (err) {
      setError("Failed to load file content");
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderFileTree = (nodes: FileNode[], level = 0) =>
    nodes.map((node) => (
      <motion.div
        key={node.path}
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={slideIn}
      >
        <div
          className={`flex items-center p-2 hover:bg-gray-800 rounded-lg cursor-pointer transition-all duration-200 ${
            selectedFile === node.path ? "bg-gray-800" : ""
          }`}
          onClick={() =>
            node.type === "dir"
              ? toggleFolder(node.path)
              : fetchFileContent(node.path)
          }
        >
          <motion.div
            animate={{ rotate: expandedFolders[node.path] ? 0 : -90 }}
            className="mr-2"
          >
            {node.type === "dir" ? (
              <svg
                className="w-5 h-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            )}
          </motion.div>

          <span
            className={`truncate ${
              selectedFile === node.path ? "text-blue-400 font-medium" : ""
            }`}
          >
            {node.name}
          </span>
        </div>

        {node.type === "dir" && expandedFolders[node.path] && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="ml-4 border-l-2 border-gray-700"
          >
            {node.children && renderFileTree(node.children, level + 1)}
          </motion.div>
        )}
      </motion.div>
    ));

  useEffect(() => {
    if (selectedFile) {
      Prism.highlightAll();
    }
  }, [fileContent]);

  const ChartSkeleton = () => (
    <div className="h-64 bg-gray-800 rounded-xl animate-pulse">
      <div className="h-full w-full bg-gray-700 rounded-xl" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-900 text-gray-100">
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="bg-gray-900/80 backdrop-blur-md fixed w-full top-0 z-50 border-b border-gray-800 shadow-2xl"
      >
        <div className="max-w-7xl mx-auto p-4">
          <form onSubmit={handleSearch} className="flex gap-4 items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter GitHub repository URL or owner/repo"
              className="flex-1 p-3 bg-gray-800/50 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none border border-gray-700 transition-all"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-white font-medium flex items-center gap-2 shadow-lg"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Visualize
            </motion.button>
          </form>
        </div>
      </motion.header>

      <div className="max-w-7xl mx-auto pt-24 pb-12 px-4">
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 p-4 bg-red-900/50 rounded-lg border border-red-700 text-red-300"
          >
            {error}
          </motion.div>
        )}

        {owner && repo && (
          <>
            {/* Header Section */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeIn}
              className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-8"
            >
              <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-300 bg-clip-text text-transparent">
                  {owner}/<span className="text-gray-100">{repo}</span>
                </h1>
                <div className="px-3 py-1 bg-gray-800/50 rounded-xl text-sm flex items-center gap-2 border border-gray-700">
                  <svg
                    className="w-4 h-4 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                    />
                  </svg>
                  {currentBranch}
                </div>
              </div>

              <motion.select
                whileHover={{ scale: 1.02 }}
                value={currentBranch}
                onChange={(e) => setCurrentBranch(e.target.value)}
                className="bg-gray-800/50 px-4 py-2 rounded-xl border border-gray-700 focus:border-blue-500 outline-none transition-colors"
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </motion.select>
            </motion.div>

            {/* Visualization Tabs */}
            <div className="mb-8">
              <div className="flex gap-2 p-1 bg-gray-800/50 rounded-xl border border-gray-700">
                {["charts", "code"].map((tab) => (
                  <motion.button
                    key={tab}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                      activeTab === tab
                        ? "bg-gray-700/50 text-blue-400 shadow-inner"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </motion.button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "charts" ? (
                <motion.div
                  key="charts"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
                >
                  {/* Commit Chart */}
                  <motion.div
                    variants={scaleIn}
                    className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700 backdrop-blur-sm shadow-xl"
                  >
                    <h3 className="text-xl font-semibold mb-4 text-blue-400">
                      Commit History
                    </h3>
                    <div ref={commitChartRef} className="h-96" />
                  </motion.div>

                  {/* Network Chart */}
                  <motion.div
                    variants={scaleIn}
                    className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700 backdrop-blur-sm shadow-xl"
                  >
                    <h3 className="text-xl font-semibold mb-4 text-purple-400">
                      Commit Network
                    </h3>
                    <div ref={networkChartRef} className="h-96" />
                  </motion.div>

                  {/* Contributors Section */}
                  <motion.div
                    variants={slideUp}
                    className="lg:col-span-2 bg-gray-800/50 p-6 rounded-2xl border border-gray-700 backdrop-blur-sm shadow-xl"
                  >
                    <h3 className="text-xl font-semibold mb-6 text-green-400">
                      Top Contributors
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {contributors.map((contributor) => (
                        <motion.div
                          key={contributor.login}
                          whileHover={{ y: -5 }}
                          className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-blue-500 transition-colors"
                        >
                          <img
                            src={contributor.avatar_url}
                            alt={contributor.login}
                            className="w-12 h-12 rounded-full border-2 border-blue-500"
                          />
                          <div>
                            <div className="font-medium">
                              {contributor.login}
                            </div>
                            <div className="text-sm text-gray-400">
                              {contributor.contributions} commits
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="grid grid-cols-1 lg:grid-cols-4 gap-6"
                >
                  {/* File Explorer */}
                  <motion.div
                    variants={slideUp}
                    className="lg:col-span-1 bg-gray-800/50 rounded-2xl border border-gray-700 p-4 backdrop-blur-sm shadow-xl"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-purple-400">
                        Explorer
                      </h3>
                      <motion.button
                        whileHover={{ rotate: 180 }}
                        onClick={() => setIsFileTreeOpen(!isFileTreeOpen)}
                        className="p-2 hover:bg-gray-700/50 rounded-lg"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={
                              isFileTreeOpen
                                ? "M5 15l7-7 7 7"
                                : "M19 9l-7 7-7-7"
                            }
                          />
                        </svg>
                      </motion.button>
                    </div>

                    <AnimatePresence>
                      {isFileTreeOpen && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="h-[500px] overflow-y-auto pr-2">
                            {renderFileTree(fileTree)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Code Preview */}
                  <motion.div
                    variants={slideUp}
                    className="lg:col-span-3 bg-gray-800/50 rounded-2xl border border-gray-700 backdrop-blur-sm shadow-xl"
                  >
                    <div className="p-4 border-b border-gray-700">
                      <h3 className="text-lg font-semibold text-blue-400">
                        {selectedFile || "Select a file to preview"}
                      </h3>
                    </div>

                    <div className="h-[600px] overflow-y-auto p-4">
                      {selectedFile ? (
                        <pre className="!m-0 !p-0 !bg-transparent">
                          <code className="language-javascript block text-sm">
                            {fileContent}
                          </code>
                        </pre>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="h-full flex items-center justify-center text-gray-500"
                        >
                          <div className="text-center space-y-4">
                            <svg
                              className="w-24 h-24 mx-auto text-gray-700"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            <div className="text-lg">
                              Select a file to view its contents
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/90 backdrop-blur-xl flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative w-24 h-24">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-full h-full border-4 border-blue-500/30 rounded-full"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="absolute top-0 left-0 w-full h-full border-4 border-blue-500 border-t-transparent rounded-full"
                />
              </div>
              <motion.span
                animate={{ opacity: [0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="text-gray-300 text-lg font-medium"
              >
                Analyzing repository...
              </motion.span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GitHubVisualizer;
