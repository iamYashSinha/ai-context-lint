import type {
    ContextAnalysis,
    DependencyInfo,
    FileStat,
    CombinedContextAnalysis,
  } from "./types.js";
  
  export function analyzeContext(
    files: FileStat[],
    dependencies: DependencyInfo[]
  ): ContextAnalysis[] {
    const tokenMap = new Map(
      files.map((file) => [file.path, file.estimatedTokens])
    );
  
    const dependencyMap = new Map(
      dependencies.map((dependency) => [
        dependency.file,
        dependency.imports,
      ])
    );
  
    function collectDependencies(
      file: string,
      visited = new Set<string>()
    ): Set<string> {
      if (visited.has(file)) {
        return visited;
      }
  
      visited.add(file);
  
      const imports = dependencyMap.get(file) ?? [];
  
      for (const dependency of imports) {
        collectDependencies(dependency, visited);
      }
  
      return visited;
    }
  
    return files.map((file) => {
      const transitiveFiles = [
        ...collectDependencies(file.path),
      ].filter((dependency) => dependency !== file.path);
  
      const dependencyTokens = transitiveFiles.reduce(
        (sum, dependency) =>
          sum + (tokenMap.get(dependency) ?? 0),
        0
      );
  
      const transitiveTokens =
        file.estimatedTokens + dependencyTokens;
  
      const amplification =
        file.estimatedTokens === 0
          ? 0
          : transitiveTokens / file.estimatedTokens;
  
      return {
        file: file.path,
        ownTokens: file.estimatedTokens,
        dependencyTokens,
        transitiveFiles,
        transitiveTokens,
        amplification,
      };
    });
}

export function analyzeCombinedContext(
    selectedFiles: string[],
    files: FileStat[],
    dependencies: DependencyInfo[]
  ): CombinedContextAnalysis {
    const tokenMap = new Map(
      files.map((file) => [file.path, file.estimatedTokens])
    );
  
    const dependencyMap = new Map(
      dependencies.map((dependency) => [
        dependency.file,
        dependency.imports,
      ])
    );
  
    function collectDependencies(
      file: string,
      visited = new Set<string>()
    ): Set<string> {
      if (visited.has(file)) {
        return visited;
      }
  
      visited.add(file);
  
      const imports = dependencyMap.get(file) ?? [];
  
      for (const dependency of imports) {
        collectDependencies(dependency, visited);
      }
  
      return visited;
    }
  
    const contextFiles = new Set<string>();
  
    for (const file of selectedFiles) {
      const dependenciesForFile = collectDependencies(file);
  
      for (const dependency of dependenciesForFile) {
        contextFiles.add(dependency);
      }
    }
  
    const ownTokens = selectedFiles.reduce(
      (sum, file) => sum + (tokenMap.get(file) ?? 0),
      0
    );
  
    const totalTokens = [...contextFiles].reduce(
      (sum, file) => sum + (tokenMap.get(file) ?? 0),
      0
    );
  
    return {
      selectedFiles,
      contextFiles: [...contextFiles],
      ownTokens,
      dependencyTokens: totalTokens - ownTokens,
      totalTokens,
    };
  }