import { defineConfig } from "vitest/config";

// `lab` hands us a port and serves us on *.lab.nestv.cc over HTTPS.
const port = process.env.PORT ? Number(process.env.PORT) : 5173;

export default defineConfig({
	server: {
		host: true,
		port,
		strictPort: !!process.env.PORT,
		allowedHosts: [".lab.nestv.cc"],
		hmr: process.env.LAB_HOST
			? { host: process.env.LAB_HOST, clientPort: 443 }
			: undefined,
	},
	preview: {
		host: true,
		port,
		strictPort: !!process.env.PORT,
		allowedHosts: [".lab.nestv.cc"],
	},
	test: {
		environment: "node",
	},
});
