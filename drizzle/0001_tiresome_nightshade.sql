CREATE TABLE `google_sheets_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`refreshToken` text NOT NULL,
	`spreadsheetId` varchar(255),
	`spreadsheetUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_sheets_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_sheets_connections_userId_unique` UNIQUE(`userId`)
);
