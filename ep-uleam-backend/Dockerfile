FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

# Usamos el script de desarrollo para ver cambios en tiempo real
CMD ["npm", "run", "dev"]