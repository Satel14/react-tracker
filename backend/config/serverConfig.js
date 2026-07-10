const mode = process.env.NODE_ENV || "development";

const config ={
    development : {
        port : "3003",
    },
    production : {
        port: Number(process.env.PORT) || Number(process.env.SERVER_PORT) || 8080,
    },
};


module.exports = config[mode];
