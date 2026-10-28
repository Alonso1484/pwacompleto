
import "dotenv/config";
import dns from "node:dns";
import app from "./app.js";

// Configuración de DNS
dns.setServers(
  (process.env.DNS_SERVERS || "1.1.1.1,8.8.8.8").split(",")
);

// Puerto del servidor
const PORT = process.env.PORT || 4000;

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`API LOCAL EN http://localhost:${PORT}`);
});
