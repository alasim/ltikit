-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LtiEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "ltiSub" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LtiEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LtiPlatform" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authEndpoint" TEXT NOT NULL,
    "tokenEndpoint" TEXT NOT NULL,
    "keysetUrl" TEXT NOT NULL,
    "deploymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LtiNonce" (
    "state" TEXT NOT NULL PRIMARY KEY,
    "nonce" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "data" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LtiEnrollment_issuer_ltiSub_key" ON "LtiEnrollment"("issuer", "ltiSub");

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlatform_issuer_clientId_key" ON "LtiPlatform"("issuer", "clientId");

-- CreateIndex
CREATE INDEX "LtiNonce_expiresAt_idx" ON "LtiNonce"("expiresAt");
