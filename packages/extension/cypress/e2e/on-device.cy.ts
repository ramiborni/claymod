import { type FakeChromeOptions, installFakeChrome } from "../support/fake-chrome";

interface FakeGpu {
  vendor?: string;
  description?: string;
  shaderF16?: boolean;
  fallback?: boolean;
  deviceMemory?: number;
}

/** Stands in for WebGPU: an adapter with the given vendor and features, or none at all. */
function openOptions(gpu: FakeGpu | null, options: FakeChromeOptions = {}) {
  cy.visit("/options.html", {
    onBeforeLoad: (win) => {
      installFakeChrome(win, {
        ...options,
        rpc: { onDeviceStatus: { ok: true, value: { downloaded: false } }, ...options.rpc },
      });
      const adapter = gpu && {
        features: { has: (name: string) => name === "shader-f16" && gpu.shaderF16 !== false },
        info: {
          vendor: gpu.vendor ?? "nvidia",
          architecture: "",
          description: gpu.description ?? "",
          isFallbackAdapter: Boolean(gpu.fallback),
        },
      };
      Object.defineProperty(win.navigator, "gpu", {
        value: { requestAdapter: async () => adapter },
        configurable: true,
      });
      Object.defineProperty(win.navigator, "deviceMemory", {
        value: gpu?.deviceMemory ?? 8,
        configurable: true,
      });
    },
  });
}

const chooseOnDevice = () => cy.get("select[name=kind]").select("on-device");
const calls = (method: string) =>
  cy.window().then((win) => win.fake.calls.filter((call) => call.method === method));

describe("options: on-device (WebLLM)", () => {
  it("suggests the 3B model on a dedicated GPU and keeps half the memory free", () => {
    openOptions({ vendor: "nvidia" });
    chooseOnDevice();
    cy.get("[data-testid=gpu-summary]")
      .should("have.class", "ok")
      .and("contain.text", "Dedicated GPU")
      .and("contain.text", "keeps about half free");
    cy.get("select[name=onDeviceModel]").should(
      "have.value",
      "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
    );
    cy.get("select[name=onDeviceModel] option").should("have.length", 3);
    cy.contains("select[name=onDeviceModel] option", "7B").should(
      "contain.text",
      "likely too large",
    );
    cy.contains("label", "Base URL").should("not.be.visible");
    cy.contains("label", /^Model/).should("not.be.visible");
  });

  it("suggests the 1.5B model on an integrated GPU and warns about bigger ones", () => {
    openOptions({ vendor: "intel", description: "Intel(R) Iris(R) Xe Graphics" });
    chooseOnDevice();
    cy.get("select[name=onDeviceModel]").should(
      "have.value",
      "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    );
    cy.get("select[name=onDeviceModel]").select("Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC");
    cy.get("[data-testid=on-device-state]").should("contain.text", "may slow your other apps");
  });

  it("offers the any-GPU builds when shader-f16 is missing", () => {
    openOptions({ vendor: "nvidia", shaderF16: false });
    chooseOnDevice();
    cy.get("select[name=onDeviceModel] option").each((option) => {
      expect(option.val()).to.contain("q4f32");
    });
  });

  it("explains when Chrome can't use the GPU", () => {
    openOptions(null);
    chooseOnDevice();
    cy.get("[data-testid=gpu-summary]").should("have.class", "error").and("contain.text", "WebGPU");
    cy.get("select[name=onDeviceModel]").should("be.disabled");
    cy.get("#on-device-files").should("not.be.visible");
  });

  it("refuses the slow software fallback", () => {
    openOptions({ vendor: "google", description: "SwiftShader", fallback: true });
    chooseOnDevice();
    cy.get("[data-testid=gpu-summary]").should("contain.text", "software GPU");
  });

  it("downloads the chosen model on request, showing its size first", () => {
    openOptions(
      { vendor: "nvidia" },
      { rpc: { onDevicePrepare: { ok: true, value: null } }, hold: ["onDevicePrepare"] },
    );
    chooseOnDevice();
    cy.get("[data-testid=on-device-state]").should("contain.text", "One-time download of 1.7 GB");
    cy.contains("button", "Download (1.7 GB)").click();
    cy.get("#on-device-progress").should("be.visible");
    calls("onDevicePrepare")
      .its("0.payload")
      .should("deep.equal", { model: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC" });
    cy.window().then((win) => win.fake.release("onDevicePrepare"));
    cy.get("[data-testid=status]").should("contain.text", "Downloaded and ready");
  });

  it("shows a downloaded model with its GPU use and a delete button", () => {
    openOptions(
      { vendor: "nvidia" },
      {
        rpc: {
          onDeviceStatus: { ok: true, value: { downloaded: true } },
          onDeviceDelete: { ok: true, value: null },
        },
      },
    );
    chooseOnDevice();
    cy.get("[data-testid=on-device-state]").should(
      "contain.text",
      "freed after a few idle minutes",
    );
    cy.contains("button", "Download").should("not.be.visible");
    cy.contains("button", "Delete download").click();
    calls("onDeviceDelete").should("have.length", 1);
  });

  it("saves the model without any key", () => {
    openOptions({ vendor: "nvidia" });
    chooseOnDevice();
    cy.get("select[name=onDeviceModel]").should(
      "have.value",
      "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
    );
    cy.contains("button", /^Save$/).click();
    cy.get("[data-testid=status]").should("have.text", "Saved.");
    cy.window()
      .its("fake.stored.providerConfig")
      .should("deep.equal", {
        v: 2,
        config: { kind: "on-device", model: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC" },
      });
  });

  it("keeps a saved model selected even when it isn't the suggestion", () => {
    openOptions(
      { vendor: "nvidia" },
      {
        storage: {
          providerConfig: {
            v: 2,
            config: { kind: "on-device", model: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC" },
          },
        },
      },
    );
    cy.get("select[name=kind]").should("have.value", "on-device");
    cy.get("select[name=onDeviceModel]").should(
      "have.value",
      "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    );
  });
});
