File Structure:

ApartmentManagementSystem_NodeJS_and_mongoDB_version/
├── config/                  //Database connection directory
│   └── database.js
├── models/                  //MongoDB schemas
│   ├── User.js
│   ├── RentApplication.js
│   └── Announcement.js
├── routes/                  //Express system path controllers
│   ├── authRoutes.js
│   ├── tenantRoutes.js
│   └── adminRoutes.js
├── views/                   //EJS layout templates
│   ├── partials/            //Reusable structural views (Tailwind injected here)
│   │   ├── adminSidebar.ejs
│   │   ├── header.ejs
│   │   ├── topbar.ejs
│   │   └── footer.ejs
│   ├── home.ejs
│   ├── preview.ejs
│   ├── login.ejs
│   ├── register.ejs
│   ├── myRoom.ejs
│   ├── rentApplication.ejs
│   ├── viewContract.ejs
│   ├── profileSettings.ejs
│   ├── notifications.ejs
│   └── admin/               //Admin workflow screens
│       ├── dashboard.ejs
│       ├── units.ejs
│       ├── tenants.ejs
│       ├── payments.ejs
│       ├── maintenance.ejs
│       ├── announcements.ejs
│       └── reports.ejs
├── public/                  //Static client folder
│   └── js/
│       └── main.js          //For simple client-side triggers if needed
├── uploads/                 //Uploaded file storage directory
│   └── applications/
├── .env                     //Environment configuration variables
├── package.json             //Node project configuration
└── server.js                //Central operational entry point
