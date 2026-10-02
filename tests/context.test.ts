import { describe, expect, it } from "vitest";

import { analyzeCombinedContext } from "../src/context.js";
import type {
  DependencyInfo,
  FileStat,
} from "../src/types.js";

describe("analyzeCombinedContext", () => {
  it("should calculate unique dependency tokens", () => {
    const files: FileStat[] = [
      {
        path: "PaymentService.ts",
        extension: ".ts",
        bytes: 332,
        estimatedTokens: 83,
        isGenerated: false,
      },
      {
        path: "PaymentClient.ts",
        extension: ".ts",
        bytes: 212,
        estimatedTokens: 53,
        isGenerated: false,
      },
      {
        path: "HttpClient.ts",
        extension: ".ts",
        bytes: 732,
        estimatedTokens: 183,
        isGenerated: false,
      },
      {
        path: "RetryPolicy.ts",
        extension: ".ts",
        bytes: 120,
        estimatedTokens: 30,
        isGenerated: false,
      },
    ];

    const dependencies: DependencyInfo[] = [
      {
        file: "PaymentService.ts",
        imports: [
          "PaymentClient.ts",
          "RetryPolicy.ts",
        ],
        importedBy: [],
      },
      {
        file: "PaymentClient.ts",
        imports: ["HttpClient.ts"],
        importedBy: ["PaymentService.ts"],
      },
      {
        file: "HttpClient.ts",
        imports: [],
        importedBy: ["PaymentClient.ts"],
      },
      {
        file: "RetryPolicy.ts",
        imports: [],
        importedBy: ["PaymentService.ts"],
      },
    ];

    const result = analyzeCombinedContext(
      [
        "PaymentService.ts",
        "PaymentClient.ts",
      ],
      files,
      dependencies
    );

    expect(result.ownTokens).toBe(136);
    expect(result.dependencyTokens).toBe(213);
    expect(result.totalTokens).toBe(349);

    expect(result.contextFiles).toHaveLength(4);
  });
  it("should not double-count shared dependencies", () => {
    const files: FileStat[] = [
      {
        path: "ServiceA.ts",
        extension: ".ts",
        bytes: 400,
        estimatedTokens: 100,
        isGenerated: false,
      },
      {
        path: "ServiceB.ts",
        extension: ".ts",
        bytes: 400,
        estimatedTokens: 100,
        isGenerated: false,
      },
      {
        path: "SharedClient.ts",
        extension: ".ts",
        bytes: 200,
        estimatedTokens: 50,
        isGenerated: false,
      },
    ];
  
    const dependencies: DependencyInfo[] = [
      {
        file: "ServiceA.ts",
        imports: ["SharedClient.ts"],
        importedBy: [],
      },
      {
        file: "ServiceB.ts",
        imports: ["SharedClient.ts"],
        importedBy: [],
      },
      {
        file: "SharedClient.ts",
        imports: [],
        importedBy: [
          "ServiceA.ts",
          "ServiceB.ts",
        ],
      },
    ];
  
    const result = analyzeCombinedContext(
      ["ServiceA.ts", "ServiceB.ts"],
      files,
      dependencies
    );
  
    expect(result.ownTokens).toBe(200);
  
    // SharedClient should only be counted once.
    expect(result.dependencyTokens).toBe(50);
  
    expect(result.totalTokens).toBe(250);
  });
  it("should handle circular dependencies", () => {
    const files: FileStat[] = [
      {
        path: "A.ts",
        extension: ".ts",
        bytes: 100,
        estimatedTokens: 25,
        isGenerated: false,
      },
      {
        path: "B.ts",
        extension: ".ts",
        bytes: 100,
        estimatedTokens: 25,
        isGenerated: false,
      },
      {
        path: "C.ts",
        extension: ".ts",
        bytes: 100,
        estimatedTokens: 25,
        isGenerated: false,
      },
    ];
  
    const dependencies: DependencyInfo[] = [
      {
        file: "A.ts",
        imports: ["B.ts"],
        importedBy: ["C.ts"],
      },
      {
        file: "B.ts",
        imports: ["C.ts"],
        importedBy: ["A.ts"],
      },
      {
        file: "C.ts",
        imports: ["A.ts"],
        importedBy: ["B.ts"],
      },
    ];
  
    const result = analyzeCombinedContext(
      ["A.ts"],
      files,
      dependencies
    );
  
    expect(result.ownTokens).toBe(25);
  
    // B and C should each be counted once.
    expect(result.dependencyTokens).toBe(50);
  
    expect(result.totalTokens).toBe(75);
  
    expect(result.contextFiles).toHaveLength(3);
  });
  it("should handle files with no dependencies", () => {
    const files: FileStat[] = [
      {
        path: "RetryPolicy.ts",
        extension: ".ts",
        bytes: 120,
        estimatedTokens: 30,
        isGenerated: false,
      },
    ];
  
    const dependencies: DependencyInfo[] = [
      {
        file: "RetryPolicy.ts",
        imports: [],
        importedBy: [],
      },
    ];
  
    const result = analyzeCombinedContext(
      ["RetryPolicy.ts"],
      files,
      dependencies
    );
  
    expect(result.ownTokens).toBe(30);
    expect(result.dependencyTokens).toBe(0);
    expect(result.totalTokens).toBe(30);
    expect(result.contextFiles).toEqual([
      "RetryPolicy.ts",
    ]);
  });
});
